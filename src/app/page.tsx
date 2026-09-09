import Link from "next/link";
import { DayRibbon } from "@/components/day-ribbon";
import { SALON_TIMEZONE } from "@/lib/salon";
import { getDaySchedule } from "@/services/schedule";
import { salonDayKey, shiftDayKey } from "@/domain/scheduling/salon-time";

/*
  Экран дня. Пока только просмотр: бронирование — следующий этап.

  Дата живёт в адресе (?date=YYYY-MM-DD), а не в состоянии компонента.
  Поэтому переключение дней — обычные ссылки: работает без JavaScript,
  ссылку на конкретный день можно отправить мастеру, а «назад» в браузере
  ведёт туда, куда человек и ожидает.
*/

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dayTitle = (dayKey: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC", // ключ — гражданская дата, часовой пояс тут ни при чём
  }).format(new Date(`${dayKey}T00:00:00Z`));

export default async function Home({ searchParams }: PageProps<"/">) {
  const now = new Date();
  const today = salonDayKey(now, SALON_TIMEZONE);

  const requested = (await searchParams).date;
  // Мусор в адресной строке не должен ронять страницу — молча показываем
  // сегодня. Валидация ровно здесь: дальше по коду дата уже корректна.
  const dayKey =
    typeof requested === "string" && DAY_KEY_PATTERN.test(requested)
      ? requested
      : today;

  const schedule = await getDaySchedule(dayKey, now);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-muted text-xs">Салон · лента дня</p>
          <h1 className="text-xl first-letter:uppercase">{dayTitle(dayKey)}</h1>
        </div>

        <nav aria-label="Выбор дня" className="flex items-center gap-2">
          <DayLink dayKey={shiftDayKey(dayKey, -1)} label="Предыдущий день">
            ←
          </DayLink>
          {dayKey !== today && <DayLink dayKey={today}>Сегодня</DayLink>}
          <DayLink dayKey={shiftDayKey(dayKey, 1)} label="Следующий день">
            →
          </DayLink>
        </nav>
      </header>

      <DayRibbon schedule={schedule} />

      <p className="text-muted mt-8 text-xs">
        Штриховкой отмечено время, когда мастер недоступен. Записаться можно
        будет на следующем этапе.
      </p>
    </main>
  );
}

/** Кнопка-таблетка: радиус в проекте кодирует роль элемента. */
function DayLink({
  dayKey,
  label,
  children,
}: {
  dayKey: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/?date=${dayKey}`}
      aria-label={label}
      className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
    >
      {children}
    </Link>
  );
}
