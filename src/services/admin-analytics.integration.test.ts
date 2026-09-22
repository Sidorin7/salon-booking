import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getSalonStats } from "./admin-analytics";
import { at, makeMaster, makeService, makeUser } from "../../tests/db/fixtures";

/*
  Аналитика салона: то же самое, что у мастера в src/services/analytics.ts,
  но без фильтра по masterId, плюс разбивка по мастерам. Домен не меняется —
  summarizePeriod и так принимает любой набор записей, здесь только сбор
  данных со всего салона вместо одного мастера.

  Неделя 14–20 сентября 2026: понедельник — 14-е, среда — 16-е.
*/

const MONDAY = "2026-09-14";
const WEDNESDAY = "2026-09-16";
const SUNDAY = "2026-09-20";

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

describe("getSalonStats", () => {
  it("суммирует выручку и загрузку по всем мастерам", async () => {
    const service = await makeService(60, 100_000);
    const client = await makeUser("CLIENT");

    const anna = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60, // 600 минут в среду
    });
    const marat = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 14 * 60, // 240 минут в среду
    });

    await makeAppointment({
      masterId: anna.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });
    await makeAppointment({
      masterId: marat.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 11,
    });

    const stats = await getSalonStats(MONDAY, SUNDAY);

    expect(stats.summary).toMatchObject({
      total: 2,
      completed: 2,
      revenueKopecks: 200_000,
      busyMin: 120,
      scheduledMin: 840, // 600 + 240
    });
  });

  it("не учитывает график отключённого мастера в общей загрузке", async () => {
    const service = await makeService(60, 100_000);
    await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const disabled = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 14 * 60,
    });
    await prisma.master.update({
      where: { id: disabled.id },
      data: { isActive: false },
    });

    const stats = await getSalonStats(MONDAY, SUNDAY);

    expect(stats.summary.scheduledMin).toBe(600);
  });

  it("возвращает строку на каждого активного мастера, даже без записей", async () => {
    const service = await makeService(60);
    const busy = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const idle = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const client = await makeUser("CLIENT");

    await makeAppointment({
      masterId: busy.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
      priceKopecks: 150_000,
    });

    const stats = await getSalonStats(MONDAY, SUNDAY);
    const byId = new Map(stats.byMaster.map((row) => [row.masterId, row]));

    expect(byId.get(busy.id)).toMatchObject({
      revenueKopecks: 150_000,
      completed: 1,
      total: 1,
    });
    expect(byId.get(idle.id)).toMatchObject({
      revenueKopecks: 0,
      completed: 0,
      total: 0,
    });
  });

  it("не включает отключённого мастера в разбивку", async () => {
    const service = await makeService(60);
    const disabled = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    await prisma.master.update({
      where: { id: disabled.id },
      data: { isActive: false },
    });

    const stats = await getSalonStats(MONDAY, SUNDAY);

    expect(stats.byMaster.some((row) => row.masterId === disabled.id)).toBe(
      false,
    );
  });

  it("суммирует выручку по услугам всего салона в topServices", async () => {
    const service = await makeService(60, 100_000);
    const client = await makeUser("CLIENT");
    const anna = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const marat = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });

    await makeAppointment({
      masterId: anna.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 11,
    });
    await makeAppointment({
      masterId: marat.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 15,
    });

    const stats = await getSalonStats(MONDAY, SUNDAY);
    const top = stats.summary.topServices.find((s) => s.title === service.title);

    expect(top).toMatchObject({ count: 2, revenueKopecks: 200_000 });
  });
});
