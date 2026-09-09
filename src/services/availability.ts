/*
  Свободное время мастера.

  Слой только собирает данные и передаёт их в домен: сам расчёт живёт
  в computeAvailableSlots и не знает ни про Prisma, ни про Next.
*/

import { prisma } from "@/lib/prisma";
import { MIN_LEAD_TIME_MIN, SALON_TIMEZONE, SLOT_STEP_MIN } from "@/lib/salon";
import { computeAvailableSlots } from "@/domain/scheduling/slots";
import type { Interval } from "@/domain/scheduling/intervals";
import {
  salonWallClockToUtc,
  weekdayOfDayKey,
  type DayKey,
} from "@/domain/scheduling/salon-time";

const toInterval = (row: { startsAt: Date; endsAt: Date }): Interval => ({
  start: row.startsAt,
  end: row.endsAt,
});

/**
 * Всё, что занимает или ограничивает день мастера.
 *
 * Отменённые записи не запрашиваются: они не занимают время — ровно так же,
 * как их не видит частичный EXCLUDE-констрейнт. Разойдись эти два места,
 * и приложение показывало бы занятым то, что база считает свободным.
 */
async function getMasterDay(masterId: string, dayKey: DayKey) {
  const weekday = weekdayOfDayKey(dayKey);

  const hours = await prisma.workingHours.findMany({
    where: { masterId, weekday },
    orderBy: { startMin: "asc" },
    select: { startMin: true, endMin: true },
  });

  if (hours.length === 0) {
    return { workingHours: [], timeOff: [], busy: [] };
  }

  const workingHours = hours.map((row) => ({
    start: salonWallClockToUtc(dayKey, row.startMin, SALON_TIMEZONE),
    end: salonWallClockToUtc(dayKey, row.endMin, SALON_TIMEZONE),
  }));

  const dayStart = workingHours[0].start;
  const dayEnd = workingHours[workingHours.length - 1].end;
  const overlapsDay = { startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } };

  const [timeOff, busy] = await Promise.all([
    prisma.timeOff.findMany({
      where: { masterId, ...overlapsDay },
      select: { startsAt: true, endsAt: true },
    }),
    prisma.appointment.findMany({
      where: { masterId, status: { not: "CANCELLED" }, ...overlapsDay },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  return {
    workingHours,
    timeOff: timeOff.map(toInterval),
    busy: busy.map(toInterval),
  };
}

/** Моменты, с которых мастер может начать услугу этой длительности. */
export async function getAvailableSlots(input: {
  masterId: string;
  dayKey: DayKey;
  durationMin: number;
  now: Date;
}): Promise<Date[]> {
  const day = await getMasterDay(input.masterId, input.dayKey);

  if (day.workingHours.length === 0) return [];

  return computeAvailableSlots({
    ...day,
    serviceDurationMin: input.durationMin,
    stepMin: SLOT_STEP_MIN,
    now: input.now,
    minLeadTimeMin: MIN_LEAD_TIME_MIN,
  });
}
