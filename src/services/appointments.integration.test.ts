import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cancelClientAppointment, getClientVisits } from "./appointments";
import { at, makeMaster, makeService, makeUser } from "../../tests/db/fixtures";

/*
  «Мои записи»: чтение уже было, здесь — новая отмена клиентом.

  Паттерн копирует src/services/master.ts (changeStatus): clientId
  стоит прямо в where, а не в отдельной проверке после поиска — чужая
  запись просто не находится, и подставленный в форму чужой id не
  выдаёт даже факт её существования.

  16 сентября 2026 — среда.
*/

const WEDNESDAY = "2026-09-16";
const MORNING = at(WEDNESDAY, 9);

async function setupVisit(options: {
  startsAtHour: number;
  durationMin?: number;
  status?: "CONFIRMED" | "CANCELLED" | "COMPLETED";
}) {
  const durationMin = options.durationMin ?? 60;
  const service = await makeService(durationMin);
  const master = await makeMaster({
    serviceIds: [service.id],
    weekdays: [3],
    startMin: 10 * 60,
    endMin: 20 * 60,
  });
  const client = await makeUser("CLIENT");

  const startsAt = at(WEDNESDAY, options.startsAtHour);
  const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

  const appointment = await prisma.appointment.create({
    data: {
      masterId: master.id,
      clientId: client.id,
      serviceId: service.id,
      startsAt,
      endsAt,
      status: options.status ?? "CONFIRMED",
      priceKopecksAtBooking: service.priceKopecks,
      durationMinAtBooking: durationMin,
    },
  });

  return { service, master, client, appointment };
}

describe("getClientVisits", () => {
  it("помечает предстоящий подтверждённый визит как отменяемый", async () => {
    const { client, appointment } = await setupVisit({ startsAtHour: 12 });

    const { upcoming } = await getClientVisits(client.id, MORNING);
    const visit = upcoming.find((v) => v.id === appointment.id);

    expect(visit?.canCancel).toBe(true);
  });

  it("не даёт отменить уже отменённый визит", async () => {
    const { client, appointment } = await setupVisit({
      startsAtHour: 12,
      status: "CANCELLED",
    });

    const { upcoming } = await getClientVisits(client.id, MORNING);
    const visit = upcoming.find((v) => v.id === appointment.id);

    expect(visit?.canCancel).toBe(false);
  });

  it("не даёт отменить визит, который уже закончился", async () => {
    const { client, appointment } = await setupVisit({ startsAtHour: 8 });
    const afterEnd = at(WEDNESDAY, 10);

    const { past } = await getClientVisits(client.id, afterEnd);
    const visit = past.find((v) => v.id === appointment.id);

    expect(visit?.canCancel).toBe(false);
  });
});

describe("cancelClientAppointment", () => {
  it("отменяет предстоящий визит своего клиента", async () => {
    const { client, appointment } = await setupVisit({ startsAtHour: 12 });

    const result = await cancelClientAppointment({
      clientId: client.id,
      appointmentId: appointment.id,
      now: MORNING,
    });

    expect(result).toEqual({ ok: true });

    const updated = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(updated.status).toBe("CANCELLED");
  });

  it("отвечает NOT_FOUND на чужой записи", async () => {
    const { appointment } = await setupVisit({ startsAtHour: 12 });
    const stranger = await makeUser("CLIENT");

    const result = await cancelClientAppointment({
      clientId: stranger.id,
      appointmentId: appointment.id,
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });

    // Чужая запись осталась нетронутой.
    const untouched = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(untouched.status).toBe("CONFIRMED");
  });

  it("отвечает NOT_ALLOWED на уже закончившемся визите", async () => {
    const { client, appointment } = await setupVisit({ startsAtHour: 8 });
    const afterEnd = at(WEDNESDAY, 10);

    const result = await cancelClientAppointment({
      clientId: client.id,
      appointmentId: appointment.id,
      now: afterEnd,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_ALLOWED" });
  });

  it("отвечает NOT_FOUND на несуществующей записи", async () => {
    const client = await makeUser("CLIENT");

    const result = await cancelClientAppointment({
      clientId: client.id,
      appointmentId: "no-such-id",
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
