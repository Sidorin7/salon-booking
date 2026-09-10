/*
  Кабинет мастера: чтение своего дня и изменение своего графика.

  Ключевое правило слоя — авторизация живёт в самом запросе, а не
  в проверке до него. У каждого изменяющего действия `masterId` стоит
  в `where`: мастер видит формы с id записей и может подставить туда
  чужой. Проверка «сначала найдём, потом сравним» оставляет между
  двумя запросами окно и лишний способ ошибиться; условие в запросе
  окна не оставляет.

  Правила переходов статуса сюда не переезжают: их знает домен
  (`appointment-status.ts`), слой только спрашивает.
*/

import { prisma } from "@/lib/prisma";
import { SALON_TIMEZONE } from "@/lib/salon";
import {
  canCancel,
  canComplete,
  type AppointmentStatus,
} from "@/domain/scheduling/appointment-status";
import { formatKopecks } from "@/domain/pricing/money";
import {
  formatSalonTime,
  salonWallClockToUtc,
  type DayKey,
} from "@/domain/scheduling/salon-time";

/** Отказы кабинета. */
export type MasterFailure =
  /** Записи/блокировки с таким id у этого мастера нет — в том числе чужая. */
  | "NOT_FOUND"
  /** Домен запретил переход: например, завершить ещё не начавшийся визит. */
  | "NOT_ALLOWED"
  /** Конец не позже начала. */
  | "BAD_RANGE"
  /** Блокировка накрыла бы подтверждённую запись. */
  | "COVERS_APPOINTMENT";

export type MasterResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: MasterFailure };

export type MasterProfile = { id: string; displayName: string };

export type MasterAppointment = {
  id: string;
  timeLabel: string;
  clientName: string;
  serviceTitle: string;
  priceLabel: string;
  clientNote: string | null;
  status: AppointmentStatus;
  canCancel: boolean;
  canComplete: boolean;
};

export type MasterTimeOff = {
  id: string;
  timeLabel: string;
  reason: string | null;
};

/** Профиль мастера по вошедшему пользователю. `null` — он не мастер. */
export async function getMasterByUserId(
  userId: string,
): Promise<MasterProfile | null> {
  return prisma.master.findUnique({
    where: { userId },
    select: { id: true, displayName: true },
  });
}

const timeRange = (row: { startsAt: Date; endsAt: Date }) =>
  `${formatSalonTime(row.startsAt, SALON_TIMEZONE)}–${formatSalonTime(row.endsAt, SALON_TIMEZONE)}`;

/** Границы гражданских суток салона в UTC. */
function salonDayBounds(dayKey: DayKey) {
  return {
    start: salonWallClockToUtc(dayKey, 0, SALON_TIMEZONE),
    end: salonWallClockToUtc(dayKey, 24 * 60, SALON_TIMEZONE),
  };
}

/**
 * День мастера: записи и блокировки.
 *
 * Флаги действий считает домен, а страница их только рисует. Иначе
 * правило «отменить можно до конца визита» пришлось бы повторить
 * в разметке — и однажды разойтись с тем, что проверяет сервис.
 */
export async function getMasterDay(
  masterId: string,
  dayKey: DayKey,
  now: Date,
): Promise<{ appointments: MasterAppointment[]; timeOff: MasterTimeOff[] }> {
  const { start, end } = salonDayBounds(dayKey);

  // Пересечение с окном суток, а не равенство дате: визит, начавшийся
  // вчера вечером, занимает время и сегодня.
  const overlapsDay = { startsAt: { lt: end }, endsAt: { gt: start } };

  const [appointments, timeOff] = await Promise.all([
    prisma.appointment.findMany({
      where: { masterId, ...overlapsDay },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        priceKopecksAtBooking: true,
        clientNote: true,
        client: { select: { name: true } },
        service: { select: { title: true } },
      },
    }),
    prisma.timeOff.findMany({
      where: { masterId, ...overlapsDay },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, endsAt: true, reason: true },
    }),
  ]);

  return {
    appointments: appointments.map((row) => ({
      id: row.id,
      timeLabel: timeRange(row),
      clientName: row.client.name,
      serviceTitle: row.service.title,
      priceLabel: formatKopecks(row.priceKopecksAtBooking),
      clientNote: row.clientNote,
      status: row.status,
      canCancel: canCancel(row.status, row, now),
      canComplete: canComplete(row.status, row, now),
    })),
    timeOff: timeOff.map((row) => ({
      id: row.id,
      timeLabel: timeRange(row),
      reason: row.reason,
    })),
  };
}

/**
 * Смена статуса записи мастером.
 *
 * `masterId` — в `where`: чужая запись просто не находится, и ответ
 * «не найдено» одинаков для несуществующей и для чужой. Так форма
 * с подставленным id не превращается в способ узнать, что такая
 * запись у кого-то есть.
 */
async function changeStatus(
  input: { masterId: string; appointmentId: string; now: Date },
  next: AppointmentStatus,
  allows: (status: AppointmentStatus, visit: { startsAt: Date; endsAt: Date }, now: Date) => boolean, // prettier-ignore
): Promise<MasterResult> {
  const appointment = await prisma.appointment.findFirst({
    where: { id: input.appointmentId, masterId: input.masterId },
    select: { id: true, startsAt: true, endsAt: true, status: true },
  });

  if (!appointment) return { ok: false, reason: "NOT_FOUND" };

  if (!allows(appointment.status, appointment, input.now)) {
    return { ok: false, reason: "NOT_ALLOWED" };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: next },
  });

  return { ok: true };
}

export function cancelAppointment(input: {
  masterId: string;
  appointmentId: string;
  now: Date;
}): Promise<MasterResult> {
  return changeStatus(input, "CANCELLED", canCancel);
}

export function completeAppointment(input: {
  masterId: string;
  appointmentId: string;
  now: Date;
}): Promise<MasterResult> {
  return changeStatus(input, "COMPLETED", canComplete);
}

/**
 * График на день недели: строки этого дня заменяются целиком.
 *
 * Замена, а не правка: смена может состоять из нескольких отрезков,
 * и «обновить первый попавшийся» оставило бы лишние.
 */
export async function setWorkingHours(input: {
  masterId: string;
  weekday: number;
  startMin: number;
  endMin: number;
}): Promise<MasterResult> {
  if (
    input.startMin < 0 ||
    input.endMin > 24 * 60 ||
    input.startMin >= input.endMin
  ) {
    return { ok: false, reason: "BAD_RANGE" };
  }

  await prisma.$transaction([
    prisma.workingHours.deleteMany({
      where: { masterId: input.masterId, weekday: input.weekday },
    }),
    prisma.workingHours.create({
      data: {
        masterId: input.masterId,
        weekday: input.weekday,
        startMin: input.startMin,
        endMin: input.endMin,
      },
    }),
  ]);

  return { ok: true };
}

/** Выходной: у дня недели не остаётся рабочих часов. */
export async function clearWorkingHours(input: {
  masterId: string;
  weekday: number;
}): Promise<MasterResult> {
  await prisma.workingHours.deleteMany({
    where: { masterId: input.masterId, weekday: input.weekday },
  });

  return { ok: true };
}

/**
 * Разовая блокировка времени.
 *
 * Отказ при пересечении с подтверждённой записью — проверка в коде,
 * и заменить её констрейнтом нельзя: EXCLUDE стережёт пересечение
 * записей между собой, а блокировки он не видит. Порядок действий
 * для мастера остаётся честным: сначала отменить запись (клиент
 * увидит отмену), потом закрывать время.
 */
export async function addTimeOff(input: {
  masterId: string;
  startsAt: Date;
  endsAt: Date;
  reason?: string;
}): Promise<MasterResult<{ timeOffId: string }>> {
  if (input.startsAt >= input.endsAt) {
    return { ok: false, reason: "BAD_RANGE" };
  }

  const covered = await prisma.appointment.count({
    where: {
      masterId: input.masterId,
      status: "CONFIRMED",
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
  });

  if (covered > 0) return { ok: false, reason: "COVERS_APPOINTMENT" };

  const created = await prisma.timeOff.create({
    data: {
      masterId: input.masterId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason,
    },
    select: { id: true },
  });

  return { ok: true, timeOffId: created.id };
}

/** Снятие блокировки. `masterId` в `where` — по той же причине, что и выше. */
export async function removeTimeOff(input: {
  masterId: string;
  timeOffId: string;
}): Promise<MasterResult> {
  const { count } = await prisma.timeOff.deleteMany({
    where: { id: input.timeOffId, masterId: input.masterId },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}

/** День недели в форме графика. */
export type ScheduleDay = {
  /** Как `Date.getDay()`: 0 — воскресенье. */
  weekday: number;
  label: string;
  /** `null` — выходной. */
  startMin: number | null;
  endMin: number | null;
};

/*
  Неделя показывается с понедельника, хотя weekday нумеруется
  с воскресенья: так её читают, а порядок хранения — дело базы.
*/
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  0: "Воскресенье",
};

/**
 * Недельный график мастера: всегда семь строк.
 *
 * Выходные тоже приходят — формой графика правят все дни сразу,
 * и «дня нет в списке» означало бы, что выходной нельзя отменить.
 */
export async function getWeeklySchedule(
  masterId: string,
): Promise<ScheduleDay[]> {
  const hours = await prisma.workingHours.findMany({
    where: { masterId },
    orderBy: { startMin: "asc" },
    select: { weekday: true, startMin: true, endMin: true },
  });

  return WEEK_ORDER.map((weekday) => {
    const day = hours.filter((row) => row.weekday === weekday);

    return {
      weekday,
      label: WEEKDAY_LABELS[weekday],
      // Смена берётся от первого отрезка до последнего: форма правит
      // её одним диапазоном, обед закрывается блокировкой.
      startMin: day.length ? day[0].startMin : null,
      endMin: day.length ? day[day.length - 1].endMin : null,
    };
  });
}
