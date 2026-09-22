import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDaySchedule } from "./schedule";
import { at, makeMaster, makeService, makeUser } from "../../tests/db/fixtures";

/*
  Лента дня: без выбранной услуги — прежнее поведение (все активные
  мастера, полный день). С выбранной услугой — только те, кто её
  оказывает; среди них у кого есть слоты — полная колонка, у кого
  нет (выходной или всё занято) — короткая плашка в busyMasters,
  а не исчезновение из вида: клиенту важно видеть разницу между
  «мастер занят сегодня» и «мастер уволился».

  16 сентября 2026 — среда.
*/

const WEDNESDAY = "2026-09-16";
const MORNING = at(WEDNESDAY, 9);

describe("getDaySchedule", () => {
  it("без услуги показывает всех активных мастеров, busyMasters пуст", async () => {
    const service = await makeService(60);
    await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING);

    expect(schedule.columns).toHaveLength(1);
    expect(schedule.busyMasters).toEqual([]);
  });

  it("с услугой не показывает мастера, который её не оказывает", async () => {
    const offered = await makeService(60);
    const other = await makeService(30);
    await makeMaster({
      serviceIds: [other.id], // не offered
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING, offered.id);

    expect(schedule.columns).toEqual([]);
    expect(schedule.busyMasters).toEqual([]);
  });

  it("мастера со свободными слотами показывает колонкой", async () => {
    const service = await makeService(60);
    const master = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING, service.id);

    expect(schedule.columns).toHaveLength(1);
    expect(schedule.columns[0].masterId).toBe(master.id);
    expect(schedule.columns[0].slots.length).toBeGreaterThan(0);
    expect(schedule.busyMasters).toEqual([]);
  });

  it("полностью занятого мастера выносит в busyMasters, а не в колонки", async () => {
    const service = await makeService(600); // на всю смену — ни одного слота
    const master = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const client = await makeUser("CLIENT");

    // Смена занята целиком одной записью той же длительности.
    await prisma.appointment.create({
      data: {
        masterId: master.id,
        clientId: client.id,
        serviceId: service.id,
        startsAt: at(WEDNESDAY, 10),
        endsAt: at(WEDNESDAY, 20),
        priceKopecksAtBooking: service.priceKopecks,
        durationMinAtBooking: service.durationMin,
      },
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING, service.id);

    expect(schedule.columns).toEqual([]);
    expect(schedule.busyMasters).toEqual([
      { masterId: master.id, displayName: master.displayName },
    ]);
  });

  it("мастера без смены в этот день тоже выносит в busyMasters", async () => {
    const service = await makeService(60);
    const master = await makeMaster({
      serviceIds: [service.id],
      weekdays: [4], // не среда — сегодня выходной
      startMin: 10 * 60,
      endMin: 20 * 60,
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING, service.id);

    expect(schedule.columns).toEqual([]);
    expect(schedule.busyMasters).toEqual([
      { masterId: master.id, displayName: master.displayName },
    ]);
  });

  it("не показывает отключённого мастера нигде — ни в колонках, ни занятым", async () => {
    const service = await makeService(60);
    const master = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    await prisma.master.update({
      where: { id: master.id },
      data: { isActive: false },
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING, service.id);

    expect(schedule.columns).toEqual([]);
    expect(schedule.busyMasters).toEqual([]);
  });

  it("границы ленты считаются только по показанным (свободным) мастерам", async () => {
    const service = await makeService(60);
    // Свободен только с 16:00
    await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 16 * 60,
      endMin: 20 * 60,
    });
    // Занят весь день, работает с 7 утра — не должен растягивать шкалу
    const busy = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 7 * 60,
      endMin: 9 * 60,
    });
    const client = await makeUser("CLIENT");
    await prisma.appointment.create({
      data: {
        masterId: busy.id,
        clientId: client.id,
        serviceId: service.id,
        startsAt: at(WEDNESDAY, 7),
        endsAt: at(WEDNESDAY, 9),
        priceKopecksAtBooking: service.priceKopecks,
        durationMinAtBooking: service.durationMin,
      },
    });

    const schedule = await getDaySchedule(WEDNESDAY, MORNING, service.id);

    expect(schedule.opensAtMin).toBe(16 * 60);
    expect(schedule.busyMasters.map((m) => m.masterId)).toContain(busy.id);
  });
});
