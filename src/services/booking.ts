/*
  Бронирование.

  Самое интересное место проекта: между проверкой «слот свободен»
  и вставкой записи всегда есть окно, в которое проскакивает второй
  клиент. Никакая проверка в коде это окно не закрывает — закрывает
  только EXCLUDE-констрейнт в базе.

  Отсюда порядок действий: проверяем всё, что можем, вежливо, а на
  последнем шаге полагаемся на базу и умеем разобрать её отказ.
*/

import { prisma } from "@/lib/prisma";
import { classifyWriteError } from "@/lib/db-errors";
import { MIN_LEAD_TIME_MIN, SALON_TIMEZONE } from "@/lib/salon";
import { salonDayKey } from "@/domain/scheduling/salon-time";
import { getAvailableSlots } from "@/services/availability";

const MINUTE_MS = 60_000;

export type BookingFailure =
  /** Мастер не оказывает эту услугу — или услуга/мастер отключены. */
  | "NOT_OFFERED"
  /** Время вне графика, занято блокировкой или услуга не помещается. */
  | "NOT_AVAILABLE"
  /** До начала меньше минимального запаса. */
  | "TOO_LATE"
  /** Слот заняли между нашей проверкой и вставкой. */
  | "SLOT_TAKEN";

export type BookingResult =
  | { ok: true; appointmentId: string }
  | { ok: false; reason: BookingFailure };

export async function bookAppointment(input: {
  clientId: string;
  masterId: string;
  serviceId: string;
  startsAt: Date;
  now: Date;
  note?: string;
}): Promise<BookingResult> {
  // Связка мастер—услуга: без неё клиент запишется на окрашивание
  // к мастеру маникюра.
  const link = await prisma.masterService.findUnique({
    where: {
      masterId_serviceId: {
        masterId: input.masterId,
        serviceId: input.serviceId,
      },
    },
    select: {
      master: { select: { id: true, isActive: true } },
      service: {
        select: {
          id: true,
          isActive: true,
          durationMin: true,
          priceKopecks: true,
        },
      },
    },
  });

  if (!link || !link.master.isActive || !link.service.isActive) {
    return { ok: false, reason: "NOT_OFFERED" };
  }

  const { service } = link;

  if (
    input.startsAt.getTime() <
    input.now.getTime() + MIN_LEAD_TIME_MIN * MINUTE_MS
  ) {
    return { ok: false, reason: "TOO_LATE" };
  }

  // Пересчитываем слоты на сервере, а не верим пришедшему времени:
  // клиент прислал момент из формы, а форму можно отправить любую.
  const slots = await getAvailableSlots({
    masterId: input.masterId,
    dayKey: salonDayKey(input.startsAt, SALON_TIMEZONE),
    durationMin: service.durationMin,
    now: input.now,
  });

  const offered = slots.some(
    (slot) => slot.getTime() === input.startsAt.getTime(),
  );

  if (!offered) {
    return { ok: false, reason: "NOT_AVAILABLE" };
  }

  // Вставка с одним повтором. Проверка выше уже сказала «свободно»,
  // и всё, что случится дальше, — это чужая параллельная запись
  // в тот же диапазон.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const created = await prisma.appointment.create({
        data: {
          masterId: input.masterId,
          clientId: input.clientId,
          serviceId: service.id,
          startsAt: input.startsAt,
          endsAt: new Date(
            input.startsAt.getTime() + service.durationMin * MINUTE_MS,
          ),
          // Копии на момент записи: изменение прайса не должно менять
          // выручку за прошлый месяц задним числом.
          priceKopecksAtBooking: service.priceKopecks,
          durationMinAtBooking: service.durationMin,
          clientNote: input.note,
        },
        select: { id: true },
      });

      return { ok: true, appointmentId: created.id };
    } catch (error) {
      const failure = classifyWriteError(error);

      // Пересечение — окончательный ответ: время занято, повторять нечего.
      if (failure === "OVERLAP") {
        return { ok: false, reason: "SLOT_TAKEN" };
      }

      // Взаимоблокировка означает лишь, что двое писали одновременно,
      // и кто победил — ещё неизвестно. PostgreSQL в таком случае просит
      // повторить транзакцию: ко второй попытке чужая уже завершилась,
      // и ответ будет определённым — либо запись, либо честное «занято».
      // Без повтора это вылезало наружу пятисотой: поймано интеграционным
      // тестом на гонку, который падал примерно раз из пяти.
      if (failure === "CONFLICT" && attempt === 0) continue;

      if (failure === "CONFLICT") {
        return { ok: false, reason: "SLOT_TAKEN" };
      }

      throw error;
    }
  }

  // Недостижимо: цикл либо возвращает результат, либо бросает исключение.
  return { ok: false, reason: "SLOT_TAKEN" };
}
