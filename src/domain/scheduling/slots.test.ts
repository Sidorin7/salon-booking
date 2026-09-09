import { describe, expect, test } from "vitest";
import { computeAvailableSlots } from "./slots";

const at = (hours: number, minutes = 0) =>
  new Date(Date.UTC(2026, 0, 15, hours, minutes));

/** Значения по умолчанию: пустой день, ничего не мешает записи. */
const base = {
  workingHours: [{ start: at(9), end: at(12) }],
  timeOff: [],
  busy: [],
  serviceDurationMin: 60,
  stepMin: 30,
  now: at(0),
  minLeadTimeMin: 0,
};

describe("computeAvailableSlots", () => {
  test("в свободный день выдаёт слоты с заданным шагом", () => {
    const result = computeAvailableSlots(base);

    // 11:00 — последний возможный старт: 11:00 + 60 мин = 12:00, ровно
    // конец рабочего дня. 11:30 уже не помещается.
    expect(result).toEqual([at(9), at(9, 30), at(10), at(10, 30), at(11)]);
  });

  test("сетка привязана к началу смены, а не к концу предыдущей записи", () => {
    const result = computeAvailableSlots({
      ...base,
      // Запись закончилась в 9:50 — «некруглое» время.
      busy: [{ start: at(9), end: at(9, 50) }],
    });

    // Клиенту предлагаем 10:00, а не 9:50 и не 10:20.
    expect(result).toEqual([at(10), at(10, 30), at(11)]);
  });

  test("услуга, не помещающаяся в остаток смены, не предлагается вовсе", () => {
    const result = computeAvailableSlots({
      ...base,
      // Окно 9–12 длится 180 минут, окрашивание требует 240.
      serviceDurationMin: 240,
    });

    expect(result).toEqual([]);
  });

  test("смежные записи не считаются пересечением", () => {
    const result = computeAvailableSlots({
      ...base,
      // Запись 11:00–12:00 вплотную к слоту 10:00–11:00.
      busy: [{ start: at(11), end: at(12) }],
    });

    // 10:00 остаётся доступным: конец одной записи совпадает
    // с началом другой, интервалы полуоткрытые.
    expect(result).toEqual([at(9), at(9, 30), at(10)]);
  });

  test("блокировка посреди дня разрывает смену на два окна", () => {
    const result = computeAvailableSlots({
      workingHours: [{ start: at(9), end: at(15) }],
      timeOff: [{ start: at(11), end: at(13) }], // обед
      busy: [],
      serviceDurationMin: 60,
      stepMin: 60,
      now: at(0),
      minLeadTimeMin: 0,
    });

    expect(result).toEqual([at(9), at(10), at(13), at(14)]);
  });

  test("время раньше минимального запаса не предлагается", () => {
    const result = computeAvailableSlots({
      ...base,
      now: at(9),
      minLeadTimeMin: 90, // записаться можно не раньше 10:30
    });

    expect(result).toEqual([at(10, 30), at(11)]);
  });

  test("в нерабочий день слотов нет", () => {
    const result = computeAvailableSlots({ ...base, workingHours: [] });

    expect(result).toEqual([]);
  });
});
