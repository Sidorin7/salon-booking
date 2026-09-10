import { describe, expect, it } from "vitest";
import {
  eachDayKey,
  formatSalonTime,
  parseWallClock,
  salonDayKey,
  salonWallClockToUtc,
  weekdayOfDayKey,
} from "./salon-time";

describe("salonWallClockToUtc", () => {
  it("переводит минуты от полуночи в момент времени UTC", () => {
    // Москва зимой и летом одинаково UTC+3: 10:00 → 07:00 UTC.
    const instant = salonWallClockToUtc("2026-09-09", 10 * 60, "Europe/Moscow");

    expect(instant.toISOString()).toBe("2026-09-09T07:00:00.000Z");
  });

  it("учитывает переход на летнее время", () => {
    // Берлин: 29 марта 2026 часы переводят вперёд. До перехода смещение
    // +1, после — +2, поэтому 10:00 в эти два дня — разные моменты UTC.
    const before = salonWallClockToUtc("2026-03-28", 10 * 60, "Europe/Berlin");
    const after = salonWallClockToUtc("2026-03-30", 10 * 60, "Europe/Berlin");

    expect(before.toISOString()).toBe("2026-03-28T09:00:00.000Z");
    expect(after.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });
});

describe("salonDayKey", () => {
  it("определяет дату по времени салона, а не по UTC", () => {
    // 23:30 UTC — это уже 02:30 следующего дня в Москве.
    const instant = new Date("2026-09-09T23:30:00.000Z");

    expect(salonDayKey(instant, "Europe/Moscow")).toBe("2026-09-10");
  });
});

describe("formatSalonTime", () => {
  it("показывает время в часовом поясе салона", () => {
    const instant = new Date("2026-09-09T07:30:00.000Z");

    expect(formatSalonTime(instant, "Europe/Moscow")).toBe("10:30");
  });
});

describe("weekdayOfDayKey", () => {
  it("считает день недели так же, как Date.getDay(): 0 — воскресенье", () => {
    expect(weekdayOfDayKey("2026-09-09")).toBe(3); // среда
    expect(weekdayOfDayKey("2026-09-13")).toBe(0); // воскресенье
  });
});

describe("parseWallClock", () => {
  it("переводит «ЧЧ:ММ» в минуты от полуночи", () => {
    expect(parseWallClock("10:30")).toBe(630);
    expect(parseWallClock("00:00")).toBe(0);
  });

  it("отвергает всё, что не время: поле формы может прийти любым", () => {
    expect(parseWallClock("24:00")).toBeNull();
    expect(parseWallClock("10:60")).toBeNull();
    expect(parseWallClock("9:30")).toBeNull();
    expect(parseWallClock("")).toBeNull();
  });
});

describe("eachDayKey", () => {
  it("перечисляет дни периода включительно с обоих концов", () => {
    expect(eachDayKey("2026-09-09", "2026-09-12")).toEqual([
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("период из одного дня — один день", () => {
    expect(eachDayKey("2026-09-09", "2026-09-09")).toEqual(["2026-09-09"]);
  });

  it("перевёрнутый период пуст, а не бесконечен", () => {
    expect(eachDayKey("2026-09-12", "2026-09-09")).toEqual([]);
  });

  it("переходит через границу месяца", () => {
    expect(eachDayKey("2026-08-31", "2026-09-01")).toEqual([
      "2026-08-31",
      "2026-09-01",
    ]);
  });
});
