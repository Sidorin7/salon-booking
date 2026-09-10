import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  addTimeOff,
  cancelAppointment,
  clearWorkingHours,
  completeAppointment,
  getMasterByUserId,
  getMasterDay,
  getWeeklySchedule,
  removeTimeOff,
  setWorkingHours,
} from "./master";
import { at, makeMaster, makeService, makeUser } from "../../tests/db/fixtures";

/*
  Интеграционные тесты кабинета мастера.

  Главная проверка здесь — чужой masterId. Мастер видит форму отмены
  и может подставить в неё любой id: если авторизация останется
  проверкой «до запроса», а не условием в самом запросе, он отменит
  чужую запись. Поэтому у каждого изменяющего действия есть тест
  «чужая запись остаётся нетронутой».

  16 сентября 2026 — среда. Дата фиксированная: тест, зависящий от дня
  запуска, однажды падает в выходной.
*/

/** Intl разделяет разряды и отделяет знак валюты неразрывным пробелом. */
const NBSP = "\u00A0";

const WEDNESDAY = "2026-09-16";
const MORNING = at(WEDNESDAY, 9);

async function setupMaster() {
  const service = await makeService(60);
  const master = await makeMaster({
    serviceIds: [service.id],
    weekdays: [3],
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
  hour: number;
  note?: string;
}) {
  return prisma.appointment.create({
    data: {
      masterId: options.masterId,
      clientId: options.clientId,
      serviceId: options.serviceId,
      startsAt: at(WEDNESDAY, options.hour),
      endsAt: at(WEDNESDAY, options.hour + 1),
      priceKopecksAtBooking: 100_000,
      durationMinAtBooking: 60,
      clientNote: options.note,
    },
  });
}

describe("getMasterByUserId", () => {
  it("находит профиль мастера по пользователю", async () => {
    const { master } = await setupMaster();

    const found = await getMasterByUserId(master.userId);

    expect(found).toMatchObject({ id: master.id, displayName: master.displayName });
  });

  it("возвращает null, если у пользователя нет профиля мастера", async () => {
    const stranger = await makeUser("CLIENT");

    expect(await getMasterByUserId(stranger.id)).toBeNull();
  });
});

describe("getMasterDay", () => {
  it("отдаёт записи дня с клиентом, ценой и заметкой", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
      note: "аллергия на аммиак",
    });

    const day = await getMasterDay(master.id, WEDNESDAY, MORNING);

    expect(day.appointments).toHaveLength(1);
    expect(day.appointments[0]).toMatchObject({
      timeLabel: "12:00–13:00",
      clientName: client.name,
      serviceTitle: service.title,
      priceLabel: `1${NBSP}000${NBSP}₽`,
      clientNote: "аллергия на аммиак",
    });
  });

  it("не показывает записи других мастеров", async () => {
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

    const day = await getMasterDay(master.id, WEDNESDAY, MORNING);

    expect(day.appointments).toEqual([]);
  });

  it("считает флаги действий доменом: утром визит можно отменить, но не завершить", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const day = await getMasterDay(master.id, WEDNESDAY, MORNING);

    expect(day.appointments[0]).toMatchObject({
      canCancel: true,
      canComplete: false,
    });
  });

  it("после начала визита разрешает завершить его", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const day = await getMasterDay(master.id, WEDNESDAY, at(WEDNESDAY, 12, 30));

    expect(day.appointments[0]).toMatchObject({
      canCancel: true,
      canComplete: true,
    });
  });

  it("отдаёт блокировки дня", async () => {
    const { master } = await setupMaster();
    await addTimeOff({
      masterId: master.id,
      startsAt: at(WEDNESDAY, 14),
      endsAt: at(WEDNESDAY, 15),
      reason: "обед",
    });

    const day = await getMasterDay(master.id, WEDNESDAY, MORNING);

    expect(day.timeOff).toHaveLength(1);
    expect(day.timeOff[0]).toMatchObject({
      timeLabel: "14:00–15:00",
      reason: "обед",
    });
  });
});

describe("cancelAppointment", () => {
  it("отменяет свою запись", async () => {
    const { service, master, client } = await setupMaster();
    const appointment = await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const result = await cancelAppointment({
      masterId: master.id,
      appointmentId: appointment.id,
      now: MORNING,
    });

    expect(result).toEqual({ ok: true });
    const saved = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(saved.status).toBe("CANCELLED");
  });

  it("не даёт отменить чужую запись", async () => {
    const { service, master, client } = await setupMaster();
    const other = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const appointment = await makeAppointment({
      masterId: other.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const result = await cancelAppointment({
      masterId: master.id,
      appointmentId: appointment.id,
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
    const saved = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(saved.status).toBe("CONFIRMED");
  });

  it("не даёт отменить визит, который уже закончился", async () => {
    const { service, master, client } = await setupMaster();
    const appointment = await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const result = await cancelAppointment({
      masterId: master.id,
      appointmentId: appointment.id,
      now: at(WEDNESDAY, 18),
    });

    expect(result).toEqual({ ok: false, reason: "NOT_ALLOWED" });
  });
});

describe("completeAppointment", () => {
  it("завершает начавшийся визит", async () => {
    const { service, master, client } = await setupMaster();
    const appointment = await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const result = await completeAppointment({
      masterId: master.id,
      appointmentId: appointment.id,
      now: at(WEDNESDAY, 13),
    });

    expect(result).toEqual({ ok: true });
    const saved = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(saved.status).toBe("COMPLETED");
  });

  it("не даёт завершить будущий визит", async () => {
    const { service, master, client } = await setupMaster();
    const appointment = await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const result = await completeAppointment({
      masterId: master.id,
      appointmentId: appointment.id,
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_ALLOWED" });
  });

  it("не даёт завершить чужую запись", async () => {
    const { service, master, client } = await setupMaster();
    const other = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const appointment = await makeAppointment({
      masterId: other.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 12,
    });

    const result = await completeAppointment({
      masterId: master.id,
      appointmentId: appointment.id,
      now: at(WEDNESDAY, 13),
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});

describe("setWorkingHours", () => {
  it("заменяет график дня недели целиком", async () => {
    const { master } = await setupMaster();

    await setWorkingHours({
      masterId: master.id,
      weekday: 3,
      startMin: 12 * 60,
      endMin: 18 * 60,
    });

    const hours = await prisma.workingHours.findMany({
      where: { masterId: master.id, weekday: 3 },
    });
    expect(hours).toHaveLength(1);
    expect(hours[0]).toMatchObject({ startMin: 12 * 60, endMin: 18 * 60 });
  });

  it("не трогает другие дни недели", async () => {
    const { master } = await setupMaster();

    await setWorkingHours({
      masterId: master.id,
      weekday: 4,
      startMin: 9 * 60,
      endMin: 15 * 60,
    });

    const wednesday = await prisma.workingHours.findMany({
      where: { masterId: master.id, weekday: 3 },
    });
    expect(wednesday).toHaveLength(1);
  });

  it("отказывает, если конец не позже начала", async () => {
    const { master } = await setupMaster();

    const result = await setWorkingHours({
      masterId: master.id,
      weekday: 4,
      startMin: 15 * 60,
      endMin: 15 * 60,
    });

    expect(result).toEqual({ ok: false, reason: "BAD_RANGE" });
  });
});

describe("clearWorkingHours", () => {
  it("делает день недели выходным", async () => {
    const { master } = await setupMaster();

    await clearWorkingHours({ masterId: master.id, weekday: 3 });

    const hours = await prisma.workingHours.findMany({
      where: { masterId: master.id, weekday: 3 },
    });
    expect(hours).toEqual([]);
  });
});

describe("addTimeOff", () => {
  it("закрывает свободное время", async () => {
    const { master } = await setupMaster();

    const result = await addTimeOff({
      masterId: master.id,
      startsAt: at(WEDNESDAY, 14),
      endsAt: at(WEDNESDAY, 15),
      reason: "обед",
    });

    expect(result).toMatchObject({ ok: true });
    expect(await prisma.timeOff.count({ where: { masterId: master.id } })).toBe(1);
  });

  it("отказывает, если блокировка накрывает подтверждённую запись", async () => {
    const { service, master, client } = await setupMaster();
    await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 14,
    });

    const result = await addTimeOff({
      masterId: master.id,
      startsAt: at(WEDNESDAY, 13),
      endsAt: at(WEDNESDAY, 16),
    });

    expect(result).toEqual({ ok: false, reason: "COVERS_APPOINTMENT" });
    expect(await prisma.timeOff.count({ where: { masterId: master.id } })).toBe(0);
  });

  it("не считает помехой отменённую запись", async () => {
    const { service, master, client } = await setupMaster();
    const appointment = await makeAppointment({
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      hour: 14,
    });
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED" },
    });

    const result = await addTimeOff({
      masterId: master.id,
      startsAt: at(WEDNESDAY, 13),
      endsAt: at(WEDNESDAY, 16),
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("отказывает, если конец не позже начала", async () => {
    const { master } = await setupMaster();

    const result = await addTimeOff({
      masterId: master.id,
      startsAt: at(WEDNESDAY, 15),
      endsAt: at(WEDNESDAY, 15),
    });

    expect(result).toEqual({ ok: false, reason: "BAD_RANGE" });
  });
});

describe("removeTimeOff", () => {
  it("снимает свою блокировку", async () => {
    const { master } = await setupMaster();
    const added = await addTimeOff({
      masterId: master.id,
      startsAt: at(WEDNESDAY, 14),
      endsAt: at(WEDNESDAY, 15),
    });
    if (!added.ok) throw new Error("блокировка не создалась");

    const result = await removeTimeOff({
      masterId: master.id,
      timeOffId: added.timeOffId,
    });

    expect(result).toEqual({ ok: true });
    expect(await prisma.timeOff.count()).toBe(0);
  });

  it("не даёт снять чужую блокировку", async () => {
    const { service, master } = await setupMaster();
    const other = await makeMaster({
      serviceIds: [service.id],
      weekdays: [3],
      startMin: 10 * 60,
      endMin: 20 * 60,
    });
    const added = await addTimeOff({
      masterId: other.id,
      startsAt: at(WEDNESDAY, 14),
      endsAt: at(WEDNESDAY, 15),
    });
    if (!added.ok) throw new Error("блокировка не создалась");

    const result = await removeTimeOff({
      masterId: master.id,
      timeOffId: added.timeOffId,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(await prisma.timeOff.count()).toBe(1);
  });
});

describe("getWeeklySchedule", () => {
  it("отдаёт все семь дней, начиная с понедельника", async () => {
    const { master } = await setupMaster();

    const week = await getWeeklySchedule(master.id);

    expect(week).toHaveLength(7);
    // Неделя показывается с понедельника, хотя weekday нумеруется
    // с воскресенья: календарь читают так, а не так, как хранят.
    expect(week.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("показывает смену рабочего дня и пустоту в выходной", async () => {
    const { master } = await setupMaster();

    const week = await getWeeklySchedule(master.id);
    const wednesday = week.find((day) => day.weekday === 3);
    const monday = week.find((day) => day.weekday === 1);

    expect(wednesday).toMatchObject({ startMin: 10 * 60, endMin: 20 * 60 });
    expect(monday).toMatchObject({ startMin: null, endMin: null });
  });
});
