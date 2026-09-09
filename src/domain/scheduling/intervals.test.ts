import { describe, expect, test } from "vitest";
import { subtractIntervals } from "./intervals";

/** Хелпер: момент времени внутри одних фиксированных суток. */
const at = (hours: number, minutes = 0) =>
  new Date(Date.UTC(2026, 0, 15, hours, minutes));

describe("subtractIntervals", () => {
  test("занятое время в середине дня разрезает рабочий интервал надвое", () => {
    const result = subtractIntervals(
      [{ start: at(9), end: at(18) }],
      [{ start: at(12), end: at(13) }],
    );

    expect(result).toEqual([
      { start: at(9), end: at(12) },
      { start: at(13), end: at(18) },
    ]);
  });

  test("блокировка вне рабочего интервала не меняет его", () => {
    const result = subtractIntervals(
      [{ start: at(9), end: at(18) }],
      [{ start: at(20), end: at(21) }],
    );

    expect(result).toEqual([{ start: at(9), end: at(18) }]);
  });
});
