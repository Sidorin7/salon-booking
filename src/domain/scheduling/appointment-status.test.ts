import { describe, expect, it } from "vitest";
import { canCancel, canComplete } from "./appointment-status";

const VISIT = {
  startsAt: new Date("2026-09-16T09:00:00.000Z"),
  endsAt: new Date("2026-09-16T10:00:00.000Z"),
};

const BEFORE = new Date("2026-09-16T08:00:00.000Z");
const DURING = new Date("2026-09-16T09:30:00.000Z");
const AFTER = new Date("2026-09-16T11:00:00.000Z");

describe("canCancel", () => {
  it("разрешает отменить подтверждённую запись до её окончания", () => {
    expect(canCancel("CONFIRMED", VISIT, BEFORE)).toBe(true);
    // Клиент не пришёл, визит идёт — отменить ещё можно.
    expect(canCancel("CONFIRMED", VISIT, DURING)).toBe(true);
  });

  it("не даёт отменить состоявшийся визит", () => {
    // Иначе выручка за прошлый месяц уменьшалась бы одним нажатием.
    // Для завершившегося визита остаётся только «завершить».
    expect(canCancel("CONFIRMED", VISIT, AFTER)).toBe(false);
  });

  it("не даёт отменить дважды и не воскрешает завершённое", () => {
    expect(canCancel("CANCELLED", VISIT, BEFORE)).toBe(false);
    expect(canCancel("COMPLETED", VISIT, BEFORE)).toBe(false);
  });
});

describe("canComplete", () => {
  it("разрешает завершить начавшийся визит", () => {
    expect(canComplete("CONFIRMED", VISIT, DURING)).toBe(true);
    expect(canComplete("CONFIRMED", VISIT, AFTER)).toBe(true);
  });

  it("не даёт завершить визит, который ещё не начался", () => {
    expect(canComplete("CONFIRMED", VISIT, BEFORE)).toBe(false);
  });

  it("не трогает отменённое и уже завершённое", () => {
    expect(canComplete("CANCELLED", VISIT, AFTER)).toBe(false);
    expect(canComplete("COMPLETED", VISIT, AFTER)).toBe(false);
  });
});
