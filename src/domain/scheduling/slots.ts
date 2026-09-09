import { subtractIntervals, type Interval } from "./intervals";

const MINUTE_MS = 60_000;

export type AvailabilityInput = {
  /** График мастера на этот день. */
  workingHours: Interval[];
  /** Отпуск, обед, разовые блокировки. */
  timeOff: Interval[];
  /** Уже существующие записи. */
  busy: Interval[];
  /** Длительность выбранной услуги. */
  serviceDurationMin: number;
  /** Шаг сетки: слоты предлагаются каждые N минут. */
  stepMin: number;
  /**
   * Текущий момент. Передаётся параметром намеренно: функция обязана
   * оставаться чистой, иначе её тесты начнут зависеть от времени запуска.
   */
  now: Date;
  /** Минимальный запас: нельзя записаться «через пять минут». */
  minLeadTimeMin: number;
};

/**
 * Возвращает моменты, с которых услугу можно начать.
 *
 * Слот годится, только если услуга целиком помещается в свободное окно:
 * окрашивание на три часа не предложат за час до конца смены.
 */
export function computeAvailableSlots(input: AvailabilityInput): Date[] {
  const free = subtractIntervals(input.workingHours, [
    ...input.timeOff,
    ...input.busy,
  ]);

  const durationMs = input.serviceDurationMin * MINUTE_MS;
  const stepMs = input.stepMin * MINUTE_MS;
  const earliestStart = input.now.getTime() + input.minLeadTimeMin * MINUTE_MS;

  // Сетка отсчитывается от начала смены, а не от начала свободного окна.
  // Иначе запись, закончившаяся в 9:50, сдвинула бы всю сетку дня
  // и клиенту предложили бы «10:20».
  const anchor = Math.min(
    ...input.workingHours.map((interval) => interval.start.getTime()),
  );

  const slots: Date[] = [];

  for (const window of free) {
    const windowEnd = window.end.getTime();
    const stepsFromAnchor = Math.ceil(
      (window.start.getTime() - anchor) / stepMs,
    );

    let start = anchor + stepsFromAnchor * stepMs;

    for (; start + durationMs <= windowEnd; start += stepMs) {
      if (start >= earliestStart) {
        slots.push(new Date(start));
      }
    }
  }

  return slots;
}
