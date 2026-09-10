/*
  Правила аналитики. Чистые функции: ни Prisma, ни `new Date()` внутри.

  Слой достаёт записи за период и рабочие минуты по графику, а что из
  этого считается выручкой и загрузкой — решается здесь и проверяется
  за миллисекунды.
*/

import type { AppointmentStatus } from "@/domain/scheduling/appointment-status";
import {
  weekdayOfDayKey,
  type DayKey,
} from "@/domain/scheduling/salon-time";

/** Запись периода в том виде, в каком её видит аналитика. */
export type PeriodAppointment = {
  status: AppointmentStatus;
  serviceTitle: string;
  /** Цена на момент записи: поднятие прайса не меняет прошлое. */
  priceKopecks: number;
  /** Длительность на момент записи — по той же причине. */
  durationMin: number;
};

export type ServiceTotal = {
  title: string;
  count: number;
  revenueKopecks: number;
};

export type PeriodStats = {
  total: number;
  completed: number;
  cancelled: number;
  /** Только завершённые визиты. */
  revenueKopecks: number;
  /** Доля отмен от всех записей периода, 0…1. */
  cancelledShare: number;
  /** Минуты, занятые неотменёнными визитами. */
  busyMin: number;
  /** Рабочие минуты по графику за период. */
  scheduledMin: number;
  /** Занятость от графика, 0…1. */
  loadShare: number;
  /** Услуги по убыванию выручки. */
  topServices: ServiceTotal[];
};

/**
 * Свод за период.
 *
 * Выручка — только `COMPLETED`. Подтверждённый визит, даже прошедший,
 * ещё не деньги: состоялся он или нет, знает мастер, и ровно для этого
 * у него есть кнопка «Завершить». Иначе цифра за один и тот же период
 * менялась бы в течение дня сама собой, и объяснить это в интерфейсе
 * было бы нечем.
 *
 * Занятость считается иначе — по всем неотменённым: время, на которое
 * записан клиент, занято независимо от того, отметили визит или нет.
 * Так же на это смотрят лента дня и EXCLUDE-констрейнт.
 */
export function summarizePeriod(
  appointments: PeriodAppointment[],
  scheduledMin: number,
): PeriodStats {
  const completed = appointments.filter((row) => row.status === "COMPLETED");
  const cancelled = appointments.filter((row) => row.status === "CANCELLED");
  const busy = appointments.filter((row) => row.status !== "CANCELLED");

  const revenueKopecks = completed.reduce(
    (sum, row) => sum + row.priceKopecks,
    0,
  );
  const busyMin = busy.reduce((sum, row) => sum + row.durationMin, 0);

  const byService = new Map<string, ServiceTotal>();

  for (const row of completed) {
    const entry = byService.get(row.serviceTitle) ?? {
      title: row.serviceTitle,
      count: 0,
      revenueKopecks: 0,
    };

    entry.count += 1;
    entry.revenueKopecks += row.priceKopecks;
    byService.set(row.serviceTitle, entry);
  }

  return {
    total: appointments.length,
    completed: completed.length,
    cancelled: cancelled.length,
    revenueKopecks,
    // Пустой период — ноль, а не NaN: делить не на что.
    cancelledShare: appointments.length
      ? cancelled.length / appointments.length
      : 0,
    busyMin,
    scheduledMin,
    // Больше единицы бывает: мастер принял клиента вне смены. Для шкалы
    // графика это поломка, а разговор идёт о заполненности дня.
    loadShare: scheduledMin ? Math.min(1, busyMin / scheduledMin) : 0,
    // По выручке, а не по числу записей: день планируют по деньгам.
    topServices: [...byService.values()].sort(
      (a, b) => b.revenueKopecks - a.revenueKopecks,
    ),
  };
}

/** Отрезок недельного графика мастера. */
export type WeeklyShift = { weekday: number; startMin: number; endMin: number };

/**
 * Рабочие минуты по графику за перечисленные дни.
 *
 * Знаменатель загрузки. Считаем именно по графику, а не по фактически
 * доступному времени: блокировка — это время, которое мастер мог продать,
 * но закрыл, и загрузку она должна снижать. Иначе показатель улучшался бы
 * от того, что мастер закрыл пустые часы отпуском.
 *
 * Отрезки складываются, поэтому график с обедом внутри смены считается
 * так, как записан.
 */
export function scheduledMinutes(
  weekly: WeeklyShift[],
  dayKeys: DayKey[],
): number {
  return dayKeys.reduce((sum, dayKey) => {
    const weekday = weekdayOfDayKey(dayKey);

    return (
      sum +
      weekly
        .filter((shift) => shift.weekday === weekday)
        .reduce((day, shift) => day + shift.endMin - shift.startMin, 0)
    );
  }, 0);
}

/** Запись, привязанная к гражданскому дню салона. */
export type DatedAppointment = PeriodAppointment & { dayKey: DayKey };

export type DailyPoint = { dayKey: DayKey; revenueKopecks: number };

/**
 * Выручка по дням — ряд для графика.
 *
 * Точка есть у каждого дня периода, в том числе пустого: пропущенный
 * день сжал бы график, и две точки подряд читались бы как соседние
 * сутки, хотя между ними неделя простоя.
 *
 * Правило выручки то же, что в своде: только завершённые. Разойдись
 * эти два места, и сумма столбиков перестала бы сходиться с итогом
 * над графиком.
 */
export function dailyRevenue(
  appointments: DatedAppointment[],
  dayKeys: DayKey[],
): DailyPoint[] {
  const byDay = new Map<DayKey, number>();

  for (const row of appointments) {
    if (row.status !== "COMPLETED") continue;

    byDay.set(row.dayKey, (byDay.get(row.dayKey) ?? 0) + row.priceKopecks);
  }

  return dayKeys.map((dayKey) => ({
    dayKey,
    revenueKopecks: byDay.get(dayKey) ?? 0,
  }));
}
