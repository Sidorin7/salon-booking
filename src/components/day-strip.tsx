import Link from "next/link";
import type { DayKey } from "@/domain/scheduling/salon-time";

/*
  Полоса из 7 дней недели вместо точечных ←/→. Видно день недели и число
  на неделю вперёд и назад разом, «сегодня» и выбранный день подсвечены
  по-разному. Обычные <Link> — работает без JavaScript, как и весь экран.
*/

const weekdayLabel = (dayKey: DayKey) =>
  new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${dayKey}T00:00:00Z`),
  );

const dayNumber = (dayKey: DayKey) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", timeZone: "UTC" }).format(
    new Date(`${dayKey}T00:00:00Z`),
  );

export function DayStrip({
  days,
  selectedDayKey,
  todayKey,
  linkFor,
  prevWeekHref,
  nextWeekHref,
}: {
  days: DayKey[];
  selectedDayKey: DayKey;
  todayKey: DayKey;
  linkFor: (dayKey: DayKey) => string;
  prevWeekHref: string;
  nextWeekHref: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Link
        className="border-sand hover:border-ink shrink-0 rounded-full border px-3 py-1 text-sm"
        href={prevWeekHref}
        aria-label="Предыдущая неделя"
      >
        ←
      </Link>

      <ul className="day-strip">
        {days.map((dayKey) => {
          const active = dayKey === selectedDayKey;
          const today = dayKey === todayKey;

          return (
            <li key={dayKey}>
              <Link
                className={`day-cell ${active ? "day-cell--active" : ""} ${
                  !active && today ? "day-cell--today" : ""
                }`}
                href={linkFor(dayKey)}
                aria-current={active ? "true" : undefined}
              >
                <span className="day-cell-weekday">{weekdayLabel(dayKey)}</span>
                <span className="day-cell-number">{dayNumber(dayKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        className="border-sand hover:border-ink shrink-0 rounded-full border px-3 py-1 text-sm"
        href={nextWeekHref}
        aria-label="Следующая неделя"
      >
        →
      </Link>
    </div>
  );
}
