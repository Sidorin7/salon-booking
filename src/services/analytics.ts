/*
  Аналитика мастера.

  Слой только достаёт данные и передаёт их в домен: что считается
  выручкой, как считается загрузка и топ услуг — правила, и живут они
  в src/domain/analytics.

  Цена и длительность берутся из полей «на момент записи», а не из
  таблицы услуг. Это и есть причина, по которой они там дублируются:
  админ поднимет прайс — выручка за прошлый месяц останется прежней.
*/

import { prisma } from "@/lib/prisma";
import { SALON_TIMEZONE } from "@/lib/salon";
import {
  dailyRevenue,
  scheduledMinutes,
  summarizePeriod,
  type DailyPoint,
  type PeriodStats,
} from "@/domain/analytics/stats";
import {
  eachDayKey,
  salonDayKey,
  salonWallClockToUtc,
  type DayKey,
} from "@/domain/scheduling/salon-time";

export type MasterStats = {
  from: DayKey;
  to: DayKey;
  summary: PeriodStats;
  daily: DailyPoint[];
};

/**
 * Свод мастера за период. Границы — гражданские даты салона включительно.
 */
export async function getMasterStats(
  masterId: string,
  from: DayKey,
  to: DayKey,
): Promise<MasterStats> {
  const dayKeys = eachDayKey(from, to);

  // Полночь начала первого дня и полночь конца последнего — по часам
  // салона. Считать по UTC значило бы отрезать вечерние визиты
  // и приписать их соседнему дню.
  const periodStart = salonWallClockToUtc(from, 0, SALON_TIMEZONE);
  const periodEnd = salonWallClockToUtc(to, 24 * 60, SALON_TIMEZONE);

  const [rows, weekly] = await Promise.all([
    prisma.appointment.findMany({
      where: { masterId, startsAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { startsAt: "asc" },
      select: {
        startsAt: true,
        status: true,
        priceKopecksAtBooking: true,
        durationMinAtBooking: true,
        service: { select: { title: true } },
      },
    }),
    prisma.workingHours.findMany({
      where: { masterId },
      select: { weekday: true, startMin: true, endMin: true },
    }),
  ]);

  const appointments = rows.map((row) => ({
    dayKey: salonDayKey(row.startsAt, SALON_TIMEZONE),
    status: row.status,
    serviceTitle: row.service.title,
    priceKopecks: row.priceKopecksAtBooking,
    durationMin: row.durationMinAtBooking,
  }));

  return {
    from,
    to,
    summary: summarizePeriod(appointments, scheduledMinutes(weekly, dayKeys)),
    daily: dailyRevenue(appointments, dayKeys),
  };
}
