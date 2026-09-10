import { describe, expect, it } from "vitest";
import {
  dailyRevenue,
  scheduledMinutes,
  summarizePeriod,
  type PeriodAppointment,
} from "./stats";

/*
  Правила аналитики — чистые функции: ни Prisma, ни времени запуска.
  Поэтому здесь можно перебирать пограничные случаи за миллисекунды.
*/

const visit = (
  status: PeriodAppointment["status"],
  overrides: Partial<PeriodAppointment> = {},
): PeriodAppointment => ({
  status,
  serviceTitle: "Стрижка",
  priceKopecks: 100_000,
  durationMin: 60,
  ...overrides,
});

describe("summarizePeriod", () => {
  it("считает выручкой только завершённые визиты", () => {
    const stats = summarizePeriod(
      [visit("COMPLETED"), visit("CONFIRMED"), visit("CANCELLED")],
      600,
    );

    // Подтверждённый визит ещё не выручка: пока мастер не отметил его
    // завершённым, состоялся он или нет — знает только мастер.
    expect(stats.revenueKopecks).toBe(100_000);
  });

  it("считает записи, завершённые и отменённые по отдельности", () => {
    const stats = summarizePeriod(
      [visit("COMPLETED"), visit("COMPLETED"), visit("CANCELLED")],
      600,
    );

    expect(stats).toMatchObject({ total: 3, completed: 2, cancelled: 1 });
  });

  it("считает долю отмен от всех записей периода", () => {
    const stats = summarizePeriod(
      [visit("COMPLETED"), visit("CONFIRMED"), visit("CANCELLED"), visit("CANCELLED")], // prettier-ignore
      600,
    );

    expect(stats.cancelledShare).toBeCloseTo(0.5);
  });

  it("на пустом периоде не делит на ноль", () => {
    const stats = summarizePeriod([], 0);

    expect(stats).toMatchObject({
      total: 0,
      revenueKopecks: 0,
      cancelledShare: 0,
      loadShare: 0,
    });
  });

  it("занятыми считает все неотменённые визиты, а не только завершённые", () => {
    // Отменённая запись время не занимает — ровно так же, как её
    // не видит частичный EXCLUDE-констрейнт и лента дня.
    const stats = summarizePeriod(
      [visit("COMPLETED"), visit("CONFIRMED"), visit("CANCELLED")],
      600,
    );

    expect(stats.busyMin).toBe(120);
  });

  it("считает загрузку от рабочих часов по графику", () => {
    const stats = summarizePeriod([visit("COMPLETED", { durationMin: 300 })], 600); // prettier-ignore

    expect(stats.loadShare).toBeCloseTo(0.5);
  });

  it("без графика загрузка равна нулю, а не бесконечности", () => {
    const stats = summarizePeriod([visit("COMPLETED")], 0);

    expect(stats.loadShare).toBe(0);
  });

  it("не даёт загрузке превысить единицу", () => {
    // Так бывает: мастер принял клиента вне смены. Показывать 140%
    // честнее было бы в отчёте бухгалтера, но здесь это ломает шкалу
    // графика, а разговор идёт о заполненности дня.
    const stats = summarizePeriod([visit("COMPLETED", { durationMin: 900 })], 600); // prettier-ignore

    expect(stats.loadShare).toBe(1);
  });

  it("строит топ услуг по выручке, а не по числу записей", () => {
    const stats = summarizePeriod(
      [
        visit("COMPLETED", { serviceTitle: "Стрижка", priceKopecks: 100_000 }),
        visit("COMPLETED", { serviceTitle: "Стрижка", priceKopecks: 100_000 }),
        visit("COMPLETED", { serviceTitle: "Окрашивание", priceKopecks: 500_000 }), // prettier-ignore
      ],
      600,
    );

    // Окрашивание одно, а денег принесло больше: мастер планирует день
    // по выручке, а не по числу голов.
    expect(stats.topServices[0]).toMatchObject({
      title: "Окрашивание",
      count: 1,
      revenueKopecks: 500_000,
    });
    expect(stats.topServices[1]).toMatchObject({
      title: "Стрижка",
      count: 2,
      revenueKopecks: 200_000,
    });
  });

  it("в топ услуг не попадают отменённые визиты", () => {
    const stats = summarizePeriod(
      [visit("CANCELLED", { serviceTitle: "Окрашивание" })],
      600,
    );

    expect(stats.topServices).toEqual([]);
  });
});

describe("scheduledMinutes", () => {
  // 9 сентября 2026 — среда, 10-е — четверг, 12-е — суббота.
  const weekly = [
    { weekday: 3, startMin: 600, endMin: 1200 }, // среда, 10 часов
    { weekday: 4, startMin: 600, endMin: 900 }, // четверг, 5 часов
  ];

  it("складывает смены всех дней периода", () => {
    expect(scheduledMinutes(weekly, ["2026-09-09", "2026-09-10"])).toBe(900);
  });

  it("выходной не добавляет ни минуты", () => {
    expect(scheduledMinutes(weekly, ["2026-09-12"])).toBe(0);
  });

  it("считает день недели столько раз, сколько он встретился", () => {
    // Две среды в периоде — две смены, а не одна.
    expect(scheduledMinutes(weekly, ["2026-09-09", "2026-09-16"])).toBe(1200);
  });

  it("складывает несколько отрезков одного дня", () => {
    const split = [
      { weekday: 3, startMin: 600, endMin: 780 },
      { weekday: 3, startMin: 840, endMin: 1200 },
    ];

    expect(scheduledMinutes(split, ["2026-09-09"])).toBe(540);
  });
});

describe("dailyRevenue", () => {
  const dated = (dayKey: string, status: PeriodAppointment["status"]) => ({
    ...visit(status),
    dayKey,
  });

  it("даёт по точке на каждый день периода, включая пустые", () => {
    // Пропущенный день сжал бы график: две точки подряд выглядели бы
    // соседними сутками, хотя между ними неделя простоя.
    const series = dailyRevenue(
      [dated("2026-09-09", "COMPLETED")],
      ["2026-09-09", "2026-09-10", "2026-09-11"],
    );

    expect(series).toHaveLength(3);
    expect(series.map((point) => point.revenueKopecks)).toEqual([100_000, 0, 0]);
  });

  it("складывает выручку нескольких визитов одного дня", () => {
    const series = dailyRevenue(
      [dated("2026-09-09", "COMPLETED"), dated("2026-09-09", "COMPLETED")],
      ["2026-09-09"],
    );

    expect(series[0].revenueKopecks).toBe(200_000);
  });

  it("считает по тому же правилу, что и свод: только завершённые", () => {
    const series = dailyRevenue(
      [dated("2026-09-09", "CONFIRMED"), dated("2026-09-09", "CANCELLED")],
      ["2026-09-09"],
    );

    expect(series[0].revenueKopecks).toBe(0);
  });
});
