import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getClientVisits, type ClientVisit } from "@/services/appointments";

/*
  Мои записи. Первая страница за логином: без неё вход никуда не ведёт.

  Проверка доступа — requireUser() прямо здесь, а не в proxy.ts.
  Proxy видит только наличие куки; действительна ли сессия, знает база,
  и спрашивают её на странице.
*/

const dayLabel = (dayKey: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
    timeZone: "UTC", // ключ — гражданская дата, пояс здесь ни при чём
  }).format(new Date(`${dayKey}T00:00:00Z`));

function VisitRow({ visit }: { visit: ClientVisit }) {
  return (
    <li className="border-sand flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-3">
      <span className="font-display text-sm tabular-nums">
        {dayLabel(visit.dayKey)}, {visit.timeLabel}
      </span>
      <span className={visit.isCancelled ? "text-muted line-through" : ""}>
        {visit.serviceTitle}
      </span>
      <span className="text-muted text-sm">{visit.masterName}</span>
      <span className="font-display ml-auto text-sm tabular-nums">
        {visit.priceLabel}
      </span>
    </li>
  );
}

export default async function AccountPage() {
  const user = await requireUser();
  const { upcoming, past } = await getClientVisits(user.id, new Date());

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">{user.email}</p>
      <h1 className="mb-8 text-xl">Мои записи</h1>

      <h2 className="mb-2 text-lg">Предстоящие</h2>
      {upcoming.length > 0 ? (
        <ul className="mb-10">
          {upcoming.map((visit) => (
            <VisitRow key={visit.id} visit={visit} />
          ))}
        </ul>
      ) : (
        <p className="text-muted mb-10 text-sm">
          Пока ничего не запланировано.{" "}
          <Link className="underline" href="/">
            Посмотреть свободное время
          </Link>
        </p>
      )}

      {past.length > 0 && (
        <>
          <h2 className="mb-2 text-lg">Уже были</h2>
          <ul>
            {past.map((visit) => (
              <VisitRow key={visit.id} visit={visit} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
