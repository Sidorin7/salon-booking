"use client";

/*
  Выручка по дням.

  Единственный клиентский компонент проекта: Recharts измеряет контейнер
  и рисует в браузере. Всё вокруг — по-прежнему серверное, и числа
  на странице читаются без JavaScript; график к ним — иллюстрация,
  а не единственный носитель данных. Для этого под ним лежит таблица
  в <details>: она работает и без скриптов.

  Одна серия — значит один цвет и никакой легенды: заголовок над
  графиком и так называет, что показано. Красить столбцы «темнее там,
  где больше» нельзя — это второй раз кодирует ту же величину, которую
  уже показывает высота.
*/

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKopecks } from "@/domain/pricing/money";

export type RevenuePoint = { dayKey: string; revenueKopecks: number };

/**
 * Подпись столбца — число месяца: полная дата на каждом превратится
 * в кашу. У первого числа вместо него короткий месяц, иначе на границе
 * месяцев ряд «30, 31, 1, 2» читается как продолжение того же месяца.
 */
const MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"]; // prettier-ignore

const dayTick = (dayKey: string) => {
  const day = Number(dayKey.slice(8));

  return day === 1 ? MONTHS_SHORT[Number(dayKey.slice(5, 7)) - 1] : String(day);
};

const fullDate = (dayKey: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
    timeZone: "UTC", // ключ — гражданская дата, пояс тут ни при чём
  }).format(new Date(`${dayKey}T00:00:00Z`));

/** Рубли без копеек: на оси важен порядок величины, а не точность до копейки. */
const axisRubles = (kopecks: number) => String(Math.round(kopecks / 100));

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: RevenuePoint }[];
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;

  return (
    <div className="chart-tooltip">
      <span className="text-xs">{fullDate(point.dayKey)}</span>
      <span className="font-display text-sm tabular-nums">
        {formatKopecks(point.revenueKopecks)}
      </span>
    </div>
  );
}

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  return (
    <>
      {/* aria-hidden: график — картинка поверх тех же чисел, которые
          лежат в таблице ниже. Дублировать их скринридеру незачем. */}
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            {/* Сетка — сплошная волосяная линия на тон от фона.
                Пунктир читался бы как «прогноз», а это просто сетка. */}
            <CartesianGrid
              stroke="var(--color-sand)"
              vertical={false}
            />
            <XAxis
              dataKey="dayKey"
              tickFormatter={dayTick}
              tickLine={false}
              stroke="var(--color-sand)"
              tick={{ fill: "var(--color-muted)", fontSize: 13 }}
            />
            <YAxis
              tickFormatter={axisRubles}
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: "var(--color-muted)", fontSize: 13 }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "var(--color-signal-soft)" }}
            />
            <Bar
              dataKey="revenueKopecks"
              fill="var(--color-signal)"
              // Скруглены только верхние углы: столбец стоит на оси,
              // и снизу скруглять нечего. 4px — тот же радиус, которым
              // в проекте помечены блоки времени.
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-4">
        <summary className="text-muted cursor-pointer text-xs">
          Показать числа таблицей
        </summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Выручка по дням периода</caption>
          <thead>
            <tr className="text-muted text-left text-xs">
              <th scope="col" className="border-sand border-b py-1 font-normal">
                День
              </th>
              <th
                scope="col"
                className="border-sand border-b py-1 text-right font-normal"
              >
                Выручка
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.dayKey}>
                <th
                  scope="row"
                  className="border-sand border-b py-1 text-left font-normal"
                >
                  {fullDate(point.dayKey)}
                </th>
                <td className="border-sand font-display border-b py-1 text-right tabular-nums">
                  {formatKopecks(point.revenueKopecks)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
