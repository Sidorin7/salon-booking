import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SALON_TIMEZONE } from "@/lib/salon";
import { getMasterByUserId } from "@/services/master";
import { getMasterStats } from "@/services/analytics";
import { formatKopecks } from "@/domain/pricing/money";
import { salonDayKey, shiftDayKey } from "@/domain/scheduling/salon-time";
import { RevenueChart } from "@/components/revenue-chart";

/*
  Аналитика мастера.

  Период — в адресе (?from=&to=), как дата на ленте дня: ссылкой можно
  поделиться, «назад» ведёт куда ожидается, и состояние не приходится
  держать в компоненте.

  Всё, что здесь считается, считает домен. Страница переводит доли
  в проценты и расставляет числа — не более.
*/

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Готовые периоды: свой диапазон руками нужен реже, чем «последние N дней». */
const PRESETS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];

const percent = (share: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);

const hours = (minutes: number) =>
  `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(minutes / 60)} ч`;

const periodLabel = (from: string, to: string) => {
  const format = (dayKey: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${dayKey}T00:00:00Z`));

  return `${format(from)} — ${format(to)}`;
};

export default async function StatsPage({
  searchParams,
}: PageProps<"/master/stats">) {
  const user = await requireRole(["MASTER"]);
  const master = await getMasterByUserId(user.id);

  if (!master) redirect("/");

  const today = salonDayKey(new Date(), SALON_TIMEZONE);
  const params = await searchParams;

  const asDayKey = (value: unknown) =>
    typeof value === "string" && DAY_KEY_PATTERN.test(value) ? value : null;

  // Мусор в адресе не должен ронять страницу: молча показываем месяц.
  const to = asDayKey(params.to) ?? today;
  const from = asDayKey(params.from) ?? shiftDayKey(to, -29);

  // Перевёрнутый период домен вернёт пустым, и это честно, но человеку
  // полезнее увидеть данные: меняем концы местами.
  const [start, end] = from <= to ? [from, to] : [to, from];

  const stats = await getMasterStats(master.id, start, end);
  const { summary } = stats;

  const presetLink = (days: number) =>
    `/master/stats?from=${shiftDayKey(today, -(days - 1))}&to=${today}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">
        {master.displayName} · кабинет мастера
      </p>
      <h1 className="mb-1 text-xl">Аналитика</h1>
      <p className="text-muted mb-8 text-sm">{periodLabel(start, end)}</p>

      <nav aria-label="Период" className="mb-10">
        <ul className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => {
            const active =
              start === shiftDayKey(today, -(preset.days - 1)) && end === today;

            return (
              <li key={preset.days}>
                <Link
                  className={`chip ${active ? "chip--active" : ""}`}
                  href={presetLink(preset.days)}
                  aria-current={active ? "true" : undefined}
                >
                  {preset.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Главная цифра — выручка, и она крупнее остальных: у сводки
          должен быть один ответ, а не четыре равнозначных. */}
      <div className="border-sand mb-10 grid gap-6 border-b pb-8 sm:grid-cols-2">
        <div className="stat stat--lead">
          <span className="stat-label">Выручка за период</span>
          <span className="stat-value">
            {formatKopecks(summary.revenueKopecks)}
          </span>
          <span className="text-muted text-xs">
            Считаются визиты, отмеченные завершёнными: {summary.completed} из{" "}
            {summary.total}
          </span>
        </div>

        <div className="grid content-start gap-6">
          <div className="stat">
            <span className="stat-label">Загрузка</span>
            <span className="stat-value">{percent(summary.loadShare)}</span>
            <div
              className="meter mt-1"
              style={{ "--share": summary.loadShare } as React.CSSProperties}
            >
              <div className="meter-fill" />
            </div>
            <span className="text-muted text-xs">
              {hours(summary.busyMin)} занято из {hours(summary.scheduledMin)}{" "}
              по графику
            </span>
          </div>

          <div className="stat">
            <span className="stat-label">Отмены</span>
            <span className="stat-value">{percent(summary.cancelledShare)}</span>
            <span className="text-muted text-xs">
              {summary.cancelled} из {summary.total} записей
            </span>
          </div>
        </div>
      </div>

      <h2 className="mb-1 text-lg">Выручка по дням</h2>
      {/* Единицы — подписью, а не на каждом делении оси: цифры
          на шкале должны читаться, а не соревноваться со значком. */}
      <p className="text-muted mb-4 text-xs">
        По вертикали рубли, по горизонтали число месяца.
      </p>
      <RevenueChart data={stats.daily} />

      <h2 className="mt-10 mb-2 text-lg">Услуги</h2>
      {summary.topServices.length > 0 ? (
        <ul>
          {summary.topServices.map((service) => (
            <li
              key={service.title}
              className="border-sand flex flex-wrap items-baseline gap-x-4 border-b py-3"
            >
              <span>{service.title}</span>
              <span className="text-muted text-sm">
                {service.count} раз
              </span>
              <span className="font-display ml-auto text-sm tabular-nums">
                {formatKopecks(service.revenueKopecks)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">
          За этот период нет ни одного завершённого визита.
        </p>
      )}

      <p className="text-muted mt-8 text-xs">
        Цена берётся такой, какой была в момент записи. Поэтому изменение
        прайса не меняет выручку за прошлый период.{" "}
        <Link className="underline" href="/master">
          К расписанию
        </Link>
      </p>
    </main>
  );
}
