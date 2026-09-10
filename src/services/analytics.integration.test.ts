import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getMasterStats } from "./analytics";
import { at, makeMaster, makeService, makeUser } from "../../tests/db/fixtures";

/*
  Аналитика на живой базе.

  Главная проверка — последняя: поднятие прайса не меняет выручку
  за прошлый период. Ради этого в записи и лежат priceKopecksAtBooking
  и durationMinAtBooking, и проверить это можно только настоящим
  UPDATE услуги, а не разговором о намерениях.

  Неделя 14–20 сентября 2026: понедельник — 14-е, среда — 16-е.
*/

const MONDAY = "2026-09-14";
const WEDNESDAY = "2026-09-16";
const SUNDAY = "2026-09-20";

async function setupMaster(durationMin = 60, priceKopecks = 100_000) {
  const service = await makeService(durationMin, priceKopecks);
  const master = await makeMaster({
    serviceIds: [service.id],
    weekdays: [3], // только среда, 10:00–20:00 — 600 минут в неделю
    startMin: 10 * 60,
    endMin: 20 * 60,
  });
  const client = await makeUser("CLIENT");

  return { service, master, client };
}

async function makeAppointment(options: {
  masterId: string;
  clientId: string;
  serviceId: string;
  dayKey?: string;
  hour: number;
  status?: "CONFIRMED" | "CANCELLED" | "COMPLETED";
  priceKopecks?: number;
  durationMin?: number;
}) {
  const dayKey = options.dayKey ?? WEDNESDAY;
  const durationMin = options.durationMin ?? 60;

  return prisma.appointment.create({
    data: {
      masterId: options.masterId,
      clientId: options.clientId,
      serviceId: options.serviceId,
      startsAt: at(dayKey, options.hour),
      endsAt: at(dayKey, options.hour, durationMin),
      status: options.status ?? "COMPLETED",
      priceKopecksAtBooking: options.priceKopecks ?? 100_000,
      durationMinAtBooking: durationMin,
    },
  });
}

describe("getMasterStats", () => {
  it("считает выручку и загрузку за период", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const stats = await getMasterStats(master.id, MONDAY, SUNDAY);

    expect(stats.summary).toMatchObject({
      total: 1,
      completed: 1,
      revenueKopecks: 100_000,
      busyMin: 60,
      scheduledMin: 600, // одна среда, 10:00–20:00
    });
    expect(stats.summary.loadShare).toBeCloseTo(0.1);
  });

  it("не берёт записи за пределами периода", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      dayKey: "2026-09-23", // следующая среда
      hour: 12,
    });

    const stats = await getMasterStats(master.id, MONDAY, SUNDAY);

    expect(stats.summary.total).toBe(0);
  });

  it("не берёт записи других мастеров", async () => {
    const { service, master, client } = await setupMaster();
    const other = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    await makeAppointment({
      masterId: other.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const stats = await getMasterStats(master.id, MONDAY, SUNDAY);

    expect(stats.summary.total).toBe(0);
  });

  it("отдаёт ряд по дням периода целиком", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const stats = await getMasterStats(master.id, MONDAY, SUNDAY);

    expect(stats.daily).toHaveLength(7);
    const wednesday = stats.daily.find((day) => day.dayKey === WEDNESDAY);
    expect(wednesday?.revenueKopecks).toBe(100_000);
  });

  it("относит визит к тому дню, в который он идёт по часам салона", async () => {
    // Запись в 23:00 по Москве — это 20:00 UTC. Группируй мы по UTC,
    // поздний визит уехал бы в предыдущий день.
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 23,
    });

    const stats = await getMasterStats(master.id, MONDAY, SUNDAY);
    const wednesday = stats.daily.find((day) => day.dayKey === WEDNESDAY);

    expect(wednesday?.revenueKopecks).toBe(100_000);
  });

  it("поднятие прайса не меняет выручку за прошлый период", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
      priceKopecks: 100_000,
    });

    await prisma.service.update({
      where: { id: service.id },
      data: { priceKopecks: 500_000 },
    });

    const stats = await getMasterStats(master.id, MONDAY, SUNDAY);

    // Ради этого priceKopecksAtBooking и дублируется в записи.
    expect(stats.summary.revenueKopecks).toBe(100_000);
  });
});
