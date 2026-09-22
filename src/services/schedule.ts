/*
  Чтение расписания на день.

  Слой между Prisma и интерфейсом: страница не должна знать ни про
  таблицы, ни про то, что рабочие часы хранятся минутами. Обратно
  уходит уже готовая к отрисовке модель дня — в минутах от начала
  рабочего дня салона, потому что именно ими лента меряет высоту.
*/

import { prisma } from "@/lib/prisma";
import { SALON_TIMEZONE } from "@/lib/salon";
import {
  formatSalonTime,
  salonWallClockToUtc,
  weekdayOfDayKey,
  type DayKey,
} from "@/domain/scheduling/salon-time";
import { getAvailableSlots } from "@/services/availability";

const MINUTE_MS = 60_000;

/** Минуты от полуночи по часам салона → «ЧЧ:ММ». */
const formatMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Занятый отрезок в колонке мастера. */
export type RibbonEntry = {
  id: string;
  kind: "appointment" | "timeOff";
  /** Минуты от начала рабочего дня салона — координата в ленте. */
  fromMin: number;
  durationMin: number;
  title: string;
  timeLabel: string;
  isCancelled: boolean;
};

/** Предложение начать услугу в это время — кнопка в ленте. */
export type SlotOffer = {
  /** Минуты от начала ленты. */
  fromMin: number;
  /** ISO-строка: уедет в форму и вернётся в Server Action. */
  startsAt: string;
  label: string;
};

export type RibbonColumn = {
  masterId: string;
  displayName: string;
  /** Смена мастера в координатах ленты. `null` — выходной. */
  shift: { fromMin: number; durationMin: number } | null;
  shiftLabel: string | null;
  entries: RibbonEntry[];
  /** Пусто, пока услуга не выбрана: без неё нет и длительности. */
  slots: SlotOffer[];
};

/**
 * Мастер, который оказывает выбранную услугу, но свободного времени
 * сегодня у него нет — выходной или всё расписано. Не пропадает из
 * вида совсем: иначе клиент не отличит «занят сегодня» от «уволился».
 */
export type BusyMaster = { masterId: string; displayName: string };

export type DaySchedule = {
  dayKey: DayKey;
  /** Минуты от полуночи, с которых начинается лента. */
  opensAtMin: number;
  /** Длина ленты в минутах. */
  lengthMin: number;
  /** Часовые отметки на линейке — минуты от начала ленты. */
  hourMarks: { fromMin: number; label: string }[];
  /** Позиция отметки «сейчас», если этот момент попадает в ленту. */
  nowMin: number | null;
  columns: RibbonColumn[];
  /** Заполняется только когда выбрана услуга — без неё делить мастеров
      на «свободен»/«занят» нечем. */
  busyMasters: BusyMaster[];
};

/**
 * Пустой день (все мастера выходные) всё равно нужно чем-то нарисовать —
 * показываем условные 10:00–20:00, чтобы линейка не схлопнулась.
 */
const FALLBACK_OPEN_MIN = 10 * 60;
const FALLBACK_CLOSE_MIN = 20 * 60;

export async function getDaySchedule(
  dayKey: DayKey,
  now: Date,
  /** Выбранная услуга: только с ней в ленте появляются слоты. */
  serviceId?: string,
): Promise<DaySchedule> {
  const weekday = weekdayOfDayKey(dayKey);

  // Услуга нужна раньше запроса мастеров: если она выбрана, в ленте
  // вообще не должно быть тех, кто её не оказывает — не пустая колонка
  // без слотов, а полное отсутствие. Мастер маникюра не имеет отношения
  // к записи на окрашивание.
  const service = serviceId
    ? await prisma.service.findFirst({
        where: { id: serviceId, isActive: true },
        select: { id: true, durationMin: true },
      })
    : null;

  const masters = await prisma.master.findMany({
    where: {
      isActive: true,
      ...(service ? { services: { some: { serviceId: service.id } } } : {}),
    },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      workingHours: {
        where: { weekday },
        orderBy: { startMin: "asc" },
        select: { startMin: true, endMin: true },
      },
    },
  });

  // Слоты — только когда выбрана услуга: без длительности вопрос
  // «что предложить» не имеет смысла.
  const slotsByMaster = new Map<string, Date[]>();

  if (service) {
    await Promise.all(
      masters.map(async (master) => {
        const slots = await getAvailableSlots({
          masterId: master.id,
          dayKey,
          durationMin: service.durationMin,
          now,
        });

        slotsByMaster.set(master.id, slots);
      }),
    );
  }

  // Мастер, который умеет услугу, но сегодня либо выходной, либо всё
  // расписано, — не колонка, а плашка: «занят», а не «пропал».
  const busyMasters: BusyMaster[] = service
    ? masters
        .filter((master) => (slotsByMaster.get(master.id) ?? []).length === 0)
        .map((master) => ({
          masterId: master.id,
          displayName: master.displayName,
        }))
    : [];

  const shownMasters = service
    ? masters.filter(
        (master) => (slotsByMaster.get(master.id) ?? []).length > 0,
      )
    : masters;

  // Границы ленты — от смен только тех мастеров, что реально в ней
  // покажутся. Иначе занятый вне вида мастер всё равно растягивал бы
  // общую шкалу под свою смену.
  const shifts = shownMasters.flatMap((master) => master.workingHours);
  const opensAtMin = shifts.length
    ? Math.min(...shifts.map((hours) => hours.startMin))
    : FALLBACK_OPEN_MIN;
  const closesAtMin = shifts.length
    ? Math.max(...shifts.map((hours) => hours.endMin))
    : FALLBACK_CLOSE_MIN;

  const dayStart = salonWallClockToUtc(dayKey, opensAtMin, SALON_TIMEZONE);
  const dayEnd = salonWallClockToUtc(dayKey, closesAtMin, SALON_TIMEZONE);

  // Пересечение с окном дня, а не равенство дате: запись, начавшаяся
  // вчера вечером и закончившаяся сегодня, тоже занимает время.
  const overlapsDay = { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } };
  const shownIds = shownMasters.map((master) => master.id);

  const [appointments, timeOff] = await Promise.all([
    prisma.appointment.findMany({
      where: { ...overlapsDay, masterId: { in: shownIds } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        masterId: true,
        startsAt: true,
        endsAt: true,
        status: true,
        service: { select: { title: true } },
      },
    }),
    prisma.timeOff.findMany({
      where: { ...overlapsDay, masterId: { in: shownIds } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        masterId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    }),
  ]);

  /** Момент времени → минуты от начала ленты. */
  const toRibbonMin = (instant: Date) =>
    Math.round((instant.getTime() - dayStart.getTime()) / MINUTE_MS);

  const entryOf = (
    row: { id: string; startsAt: Date; endsAt: Date },
    kind: RibbonEntry["kind"],
    title: string,
    isCancelled = false,
  ): RibbonEntry => {
    // Обрезаем по границам ленты: у блока, начавшегося вчера,
    // отрицательный отступ увёл бы его за верхний край.
    const fromMin = Math.max(0, toRibbonMin(row.startsAt));
    const toMin = Math.min(closesAtMin - opensAtMin, toRibbonMin(row.endsAt));

    return {
      id: row.id,
      kind,
      fromMin,
      durationMin: Math.max(0, toMin - fromMin),
      title,
      timeLabel: `${formatSalonTime(row.startsAt, SALON_TIMEZONE)}–${formatSalonTime(row.endsAt, SALON_TIMEZONE)}`,
      isCancelled,
    };
  };

  const columns: RibbonColumn[] = shownMasters.map((master) => {
    const hours = master.workingHours;
    const shiftStart = hours.length ? hours[0].startMin : null;
    const shiftEnd = hours.length ? hours[hours.length - 1].endMin : null;

    const entries = [
      ...appointments
        .filter((row) => row.masterId === master.id)
        .map((row) =>
          entryOf(
            row,
            "appointment",
            row.service.title,
            row.status === "CANCELLED",
          ),
        ),
      ...timeOff
        .filter((row) => row.masterId === master.id)
        .map((row) => entryOf(row, "timeOff", row.reason ?? "Недоступно")),
    ].sort((a, b) => a.fromMin - b.fromMin);

    return {
      masterId: master.id,
      displayName: master.displayName,
      shift:
        shiftStart === null || shiftEnd === null
          ? null
          : {
              fromMin: shiftStart - opensAtMin,
              durationMin: shiftEnd - shiftStart,
            },
      shiftLabel:
        shiftStart === null || shiftEnd === null
          ? null
          : `${formatMinutes(shiftStart)}–${formatMinutes(shiftEnd)}`,
      entries,
      slots: (slotsByMaster.get(master.id) ?? []).map((startsAt) => ({
        fromMin: toRibbonMin(startsAt),
        startsAt: startsAt.toISOString(),
        label: formatSalonTime(startsAt, SALON_TIMEZONE),
      })),
    };
  });

  const hourMarks = [];
  // Первая отметка — ближайший целый час не раньше открытия.
  for (
    let minute = Math.ceil(opensAtMin / 60) * 60;
    minute <= closesAtMin;
    minute += 60
  ) {
    hourMarks.push({
      fromMin: minute - opensAtMin,
      label: String(Math.floor(minute / 60) % 24),
    });
  }

  const nowMin = toRibbonMin(now);

  return {
    dayKey,
    opensAtMin,
    lengthMin: closesAtMin - opensAtMin,
    hourMarks,
    nowMin: nowMin >= 0 && nowMin <= closesAtMin - opensAtMin ? nowMin : null,
    columns,
    busyMasters,
  };
}
