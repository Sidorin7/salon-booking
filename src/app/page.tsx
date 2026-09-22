import Link from "next/link";
import { DayRibbon } from "@/components/day-ribbon";
import { SALON_TIMEZONE } from "@/lib/salon";
import { getDaySchedule } from "@/services/schedule";
import { getActiveServices } from "@/services/catalog";
import { salonDayKey, shiftDayKey } from "@/domain/scheduling/salon-time";

/*
  Экран дня: лента занятости и, если выбрана услуга, свободные слоты.

  Всё состояние — в адресе (?date=, ?service=). Поэтому переключение дней
  и выбор услуги — обычные ссылки: работает без JavaScript, ссылкой можно
  поделиться, «назад» в браузере ведёт туда, куда человек ожидает.
*/

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Отказы бронирования, объяснённые словами. */
const BOOKING_ERRORS: Record<string, string> = {
  slot_taken:
    "Это время только что заняли — буквально пока вы выбирали. Выберите другое.",
  not_available: "Это время уже недоступно. Обновите день и выберите другое.",
  too_late: "Записаться так близко к началу нельзя. Выберите время попозже.",
  not_offered: "Этот мастер не оказывает выбранную услугу.",
};

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
  const params = await searchParams;

  // Мусор в адресной строке не должен ронять страницу — молча показываем
  // сегодня. Валидация ровно здесь: дальше по коду дата уже корректна.
  const requested = params.date;
  const dayKey =
    typeof requested === "string" && DAY_KEY_PATTERN.test(requested)
      ? requested
      : today;

  const serviceParam =
    typeof params.service === "string" ? params.service : undefined;
  const error =
    typeof params.error === "string" ? BOOKING_ERRORS[params.error] : null;

  const [services, schedule] = await Promise.all([
    getActiveServices(),
    getDaySchedule(dayKey, now, serviceParam),
  ]);

  // Несуществующая услуга в адресе — то же самое, что не выбранная.
  const serviceId = services.some((service) => service.id === serviceParam)
    ? serviceParam
    : undefined;

  const link = (next: { date?: string; service?: string | null }) => {
    const query = new URLSearchParams({ date: next.date ?? dayKey });
    const service = next.service === undefined ? serviceId : next.service;
    if (service) query.set("service", service);

    return `/?${query}`;
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-muted text-xs">Салон · лента дня</p>
          <h1 className="text-xl first-letter:uppercase">{dayTitle(dayKey)}</h1>
        </div>

        <nav aria-label="Выбор дня" className="flex items-center gap-2">
          <Link
            className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
            href={link({ date: shiftDayKey(dayKey, -1) })}
            aria-label="Предыдущий день"
          >
            ←
          </Link>
          {dayKey !== today && (
            <Link
              className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
              href={link({ date: today })}
            >
              Сегодня
            </Link>
          )}
          <Link
            className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
            href={link({ date: shiftDayKey(dayKey, 1) })}
            aria-label="Следующий день"
          >
            →
          </Link>
        </nav>
      </header>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <nav aria-label="Выбор услуги" className="mb-8">
        <p className="text-muted text-xs">Шаг 1 · Услуга</p>
        <p className="mb-3 text-sm">
          Выберите услугу — от неё зависит, у кого и когда есть свободное
          время.
        </p>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {services.map((service) => {
            const active = service.id === serviceId;

            return (
              <li key={service.id}>
                <Link
                  className={`service-card ${active ? "service-card--active" : ""}`}
                  href={link({ service: active ? null : service.id })}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="service-card-title">
                    {service.title}
                    {active && (
                      <span className="service-card-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </span>
                  <span className="service-card-meta">
                    {service.durationMin} мин · {service.priceLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mb-3">
        <p className="text-muted text-xs">Шаг 2 · Время</p>
        <p className={`text-sm ${serviceId ? "" : "text-muted"}`}>
          {serviceId
            ? "Нажмите на свободное время, чтобы записаться. Штриховка — время, когда мастер недоступен."
            : "Станет доступно, когда вы выберете услугу выше."}
        </p>
      </div>

      <DayRibbon schedule={schedule} serviceId={serviceId} />
    </main>
  );
}
