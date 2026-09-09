/**
 * Полуоткрытый интервал времени [start, end).
 * Конец не входит: запись 10:00–11:00 и запись 11:00–12:00 не пересекаются.
 */
export type Interval = {
  start: Date;
  end: Date;
};

const earlier = (a: Date, b: Date) => (a < b ? a : b);
const later = (a: Date, b: Date) => (a > b ? a : b);

/**
 * Вычитает интервалы `cuts` из каждого интервала `base`.
 * Возвращает то, что осталось свободным.
 */
export function subtractIntervals(
  base: Interval[],
  cuts: Interval[],
): Interval[] {
  let remaining = base;

  for (const cut of cuts) {
    const next: Interval[] = [];

    for (const piece of remaining) {
      // Границы выреза ограничиваем границами куска: иначе вырез,
      // лежащий за пределами куска, растянул бы его наружу.
      if (piece.start < cut.start) {
        next.push({ start: piece.start, end: earlier(piece.end, cut.start) });
      }
      if (piece.end > cut.end) {
        next.push({ start: later(piece.start, cut.end), end: piece.end });
      }
    }

    remaining = next;
  }

  return remaining;
}
