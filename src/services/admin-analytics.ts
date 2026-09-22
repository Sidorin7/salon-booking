/*
  Аналитика салона целиком — та же логика, что и у мастера
  (src/services/analytics.ts), но без фильтра по masterId. Домен не
  меняется: summarizePeriod и так принимает любой набор записей,
  здесь только сбор данных со всего салона плюс разбивка по мастерам.
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

export type MasterStatsRow = {
  masterId: string;
  displayName: string;
  revenueKopecks: number;
  completed: number;
  total: number;
  loadShare: number;
};

export type SalonStats = {
  from: DayKey;
  to: DayKey;
  summary: PeriodStats;
  daily: DailyPoint[];
  byMaster: MasterStatsRow[];
};

/** Свод по всему салону за период. Границы — гражданские даты включительно. */
export async function getSalonStats(
  from: DayKey,
  to: DayKey,
): Promise<SalonStats> {
  const dayKeys = eachDayKey(from, to);
  const periodStart = salonWallClockToUtc(from, 0, SALON_TIMEZONE);
  const periodEnd = salonWallClockToUtc(to, 24 * 60, SALON_TIMEZONE);

  const [rows, masters] = await Promise.all([
    prisma.appointment.findMany({
      where: { startsAt: { gte: periodStart, lt: periodEnd } },
      orderBy: { startsAt: "asc" },
      select: {
        masterId: true,
        startsAt: true,
        status: true,
        priceKopecksAtBooking: true,
        durationMinAtBooking: true,
        service: { select: { title: true } },
      },
    }),
    // Только активные: график отключённого мастера не в счёт — он
    // никого не принимает, и его смена не должна раздувать знаменатель
    // общей загрузки. История его прошлых записей при этом никуда
    // не девается — она приходит вместе с rows выше.
    prisma.master.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        workingHours: { select: { weekday: true, startMin: true, endMin: true } }, // prettier-ignore
      },
    }),
  ]);

  const appointments = rows.map((row) => ({
    dayKey: salonDayKey(row.startsAt, SALON_TIMEZONE),
    status: row.status,
    serviceTitle: row.service.title,
    priceKopecks: row.priceKopecksAtBooking,
    durationMin: row.durationMinAtBooking,
  }));

  const allWeekly = masters.flatMap((master) => master.workingHours);

  const byMaster: MasterStatsRow[] = masters.map((master) => {
    const own = rows
      .filter((row) => row.masterId === master.id)
      .map((row) => ({
        dayKey: salonDayKey(row.startsAt, SALON_TIMEZONE),
        status: row.status,
        serviceTitle: row.service.title,
        priceKopecks: row.priceKopecksAtBooking,
        durationMin: row.durationMinAtBooking,
      }));

    const stats = summarizePeriod(
      own,
      scheduledMinutes(master.workingHours, dayKeys),
    );

    return {
      masterId: master.id,
      displayName: master.displayName,
      revenueKopecks: stats.revenueKopecks,
      completed: stats.completed,
      total: stats.total,
      loadShare: stats.loadShare,
    };
  });

  byMaster.sort((a, b) => b.revenueKopecks - a.revenueKopecks);

  return {
    from,
    to,
    summary: summarizePeriod(appointments, scheduledMinutes(allWeekly, dayKeys)), // prettier-ignore
    daily: dailyRevenue(appointments, dayKeys),
    byMaster,
  };
}
