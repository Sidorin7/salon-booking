import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookAppointment } from "./booking";
import { at, makeMaster, makeService, makeUser } from "../../tests/db/fixtures";

/*
  Интеграционные тесты бронирования: настоящий PostgreSQL.

  Главное здесь — последний тест. Гонку за один слот нельзя проверить
  моками: её ловит EXCLUDE-констрейнт в базе, а не наш код. Мок ответил бы
  ровно то, что мы ему подскажем, и проверял бы наши представления,
  а не поведение системы.

  16 сентября 2026 — среда. Дата фиксированная: тест, зависящий от дня
  запуска, однажды падает в выходной и портит всем утро.
*/

const WEDNESDAY = "2026-09-16";
const MORNING = at(WEDNESDAY, 9); // «сейчас» во всех тестах — 09:00

async function setupSalon(durationMin = 60) {
  const service = await makeService(durationMin);
  const master = await makeMaster({
    serviceIds: [service.id],
    weekdays: [3],
    startMin: 10 * 60,
    endMin: 20 * 60,
  });
  const client = await makeUser("CLIENT");

  return { service, master, client };
}

describe("bookAppointment", () => {
  it("записывает клиента на свободное время", async () => {
    const { service, master, client } = await setupSalon();

    const result = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 12),
      now: MORNING,
    });

    expect(result).toMatchObject({ ok: true });

    const saved = await prisma.appointment.findFirstOrThrow();
    expect(saved.startsAt.toISOString()).toBe(at(WEDNESDAY, 12).toISOString());
    expect(saved.endsAt.toISOString()).toBe(at(WEDNESDAY, 13).toISOString());
    // Цена и длительность копируются на момент записи: поднятие прайса
    // не должно менять прошлое.
    expect(saved.priceKopecksAtBooking).toBe(service.priceKopecks);
    expect(saved.durationMinAtBooking).toBe(service.durationMin);
  });

  it("отказывает, если мастер не оказывает эту услугу", async () => {
    const { master, client } = await setupSalon();
    const foreign = await makeService(30);

    const result = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: foreign.id,
      startsAt: at(WEDNESDAY, 12),
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_OFFERED" });
  });

  it("отказывает, если услуга не помещается до конца смены", async () => {
    // Смена до 20:00, услуга 60 минут: 19:30 не влезает.
    const { service, master, client } = await setupSalon();

    const result = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 19, 30),
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_AVAILABLE" });
  });

  it("отказывает, если до начала осталось меньше минимального запаса", async () => {
    const { service, master, client } = await setupSalon();

    const result = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 10),
      now: at(WEDNESDAY, 9, 45), // запас 60 минут, осталось 15
    });

    expect(result).toEqual({ ok: false, reason: "TOO_LATE" });
  });

  it("не даёт занять время, которое уже занято", async () => {
    const { service, master, client } = await setupSalon();
    const other = await makeUser("CLIENT");

    await bookAppointment({
      clientId: other.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 12),
      now: MORNING,
    });

    const result = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 12, 30),
      now: MORNING,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_AVAILABLE" });
  });

  it("освобождает время после отмены", async () => {
    const { service, master, client } = await setupSalon();

    const first = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 12),
      now: MORNING,
    });
    expect(first.ok).toBe(true);

    await prisma.appointment.updateMany({ data: { status: "CANCELLED" } });

    const second = await bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt: at(WEDNESDAY, 12),
      now: MORNING,
    });

    expect(second).toMatchObject({ ok: true });
  });

  it("при гонке за один слот побеждает ровно один клиент", async () => {
    // Инвариант, ради которого выбирался PostgreSQL: как бы ни легли
    // тайминги, двух пересекающихся записей не появляется.
    //
    // Проигравший получает либо SLOT_TAKEN (упёрся в констрейнт), либо
    // NOT_AVAILABLE (успел увидеть чужую запись до вставки). Требовать
    // здесь конкретный из двух — значит написать плавающий тест:
    // исход зависит от того, кто первым дошёл до базы. Что именно
    // происходит на стороне констрейнта, проверяет следующий тест.
    const { service, master } = await setupSalon();
    const first = await makeUser("CLIENT");
    const second = await makeUser("CLIENT");

    const attempt = (clientId: string) =>
      bookAppointment({
        clientId,
        masterId: master.id,
        serviceId: service.id,
        startsAt: at(WEDNESDAY, 12),
        now: MORNING,
      });

    const results = await Promise.all([attempt(first.id), attempt(second.id)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({ ok: false }),
    );
    expect(await prisma.appointment.count()).toBe(1);
  });

  it("превращает отказ констрейнта в «время только что заняли»", async () => {
    // Тот самый зазор между SELECT и INSERT, воспроизведённый нарочно.
    //
    // Открытая транзакция вставляет конфликтующую запись и не фиксирует
    // её. Проверка внутри bookAppointment этой строки не видит (READ
    // COMMITTED) и говорит «свободно», а INSERT упирается в EXCLUDE
    // и повисает, ожидая чужую транзакцию. Как только та фиксируется,
    // база отвечает 23P01 — ровно тот путь, который в жизни случается
    // раз в тысячу записей и который иначе не проверить.
    const { service, master, client } = await setupSalon();
    const holderClient = await makeUser("CLIENT");
    const startsAt = at(WEDNESDAY, 12);

    let markInserted!: () => void;
    const inserted = new Promise<void>((resolve) => {
      markInserted = resolve;
    });
    let commit!: () => void;
    const held = new Promise<void>((resolve) => {
      commit = resolve;
    });

    const holder = prisma.$transaction(
      async (tx) => {
        await tx.appointment.create({
          data: {
            masterId: master.id,
            clientId: holderClient.id,
            serviceId: service.id,
            startsAt,
            endsAt: at(WEDNESDAY, 13),
            priceKopecksAtBooking: service.priceKopecks,
            durationMinAtBooking: service.durationMin,
          },
        });
        markInserted();
        await held;
      },
      { timeout: 10_000 },
    );

    await inserted;

    const attempt = bookAppointment({
      clientId: client.id,
      masterId: master.id,
      serviceId: service.id,
      startsAt,
      now: MORNING,
    });

    // Пауза даёт bookAppointment дойти до INSERT и там заблокироваться.
    // Без неё транзакция могла бы зафиксироваться раньше, и проверка
    // доступности честно вернула бы NOT_AVAILABLE — другой путь.
    await new Promise((resolve) => setTimeout(resolve, 300));
    commit();

    const [result] = await Promise.all([attempt, holder]);

    expect(result).toEqual({ ok: false, reason: "SLOT_TAKEN" });
    expect(await prisma.appointment.count()).toBe(1);
  });
});
