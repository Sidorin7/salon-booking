import { prisma } from "@/lib/prisma";
import { SALON_TIMEZONE } from "@/lib/salon";
import { formatSalonTime, salonDayKey } from "@/domain/scheduling/salon-time";
import { formatKopecks } from "@/domain/pricing/money";

export type ClientVisit = {
  id: string;
  dayKey: string;
  timeLabel: string;
  serviceTitle: string;
  masterName: string;
  priceLabel: string;
  isCancelled: boolean;
};

/**
 * Визиты клиента: сначала будущие, затем прошедшие.
 *
 * Цена берётся из `priceKopecksAtBooking`, а не из текущего прайса:
 * человек должен видеть ту сумму, о которой договаривались, даже если
 * салон с тех пор поднял цены.
 */
export async function getClientVisits(
  clientId: string,
  now: Date,
): Promise<{ upcoming: ClientVisit[]; past: ClientVisit[] }> {
  const rows = await prisma.appointment.findMany({
    where: { clientId },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      priceKopecksAtBooking: true,
      service: { select: { title: true } },
      master: { select: { displayName: true } },
    },
  });

  const toVisit = (row: (typeof rows)[number]): ClientVisit => ({
    id: row.id,
    dayKey: salonDayKey(row.startsAt, SALON_TIMEZONE),
    timeLabel: `${formatSalonTime(row.startsAt, SALON_TIMEZONE)}–${formatSalonTime(row.endsAt, SALON_TIMEZONE)}`,
    serviceTitle: row.service.title,
    masterName: row.master.displayName,
    priceLabel: formatKopecks(row.priceKopecksAtBooking),
    isCancelled: row.status === "CANCELLED",
  });

  // Граница — конец записи, а не начало: визит, который идёт прямо
  // сейчас, ещё предстоящий, а не «прошлый».
  const upcoming = rows.filter((row) => row.endsAt > now).map(toVisit);
  const past = rows
    .filter((row) => row.endsAt <= now)
    .reverse()
    .map(toVisit);

  return { upcoming, past };
}
