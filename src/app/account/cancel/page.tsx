import Link from "next/link";
import { requireUser } from "@/lib/session";
import { getClientVisits } from "@/services/appointments";
import { cancelVisitAction } from "../actions";

/*
  Экран подтверждения отмены — симметрично экрану подтверждения брони
  (src/app/booking/confirm/page.tsx): человек должен увидеть, какую
  именно запись отменяет, прежде чем время освободится.

  Отдельного «получить одну запись» в сервисном слое нет — на «Моих
  записях» и так уже читается весь список, здесь просто ищем в нём
  нужную по id. Заводить лишний запрос ради одной строки не нужно.
*/

const ERRORS: Record<string, string> = {
  not_found: "Такой записи у вас нет — возможно, страница устарела.",
  not_allowed:
    "Эту запись уже нельзя отменить: она либо уже отменена, либо визит закончился.",
};

const dayLabel = (dayKey: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${dayKey}T00:00:00Z`));

export default async function CancelVisitPage({
  searchParams,
}: PageProps<"/account/cancel">) {
  const user = await requireUser();
  const params = await searchParams;

  const appointmentId =
    typeof params.appointmentId === "string" ? params.appointmentId : "";
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;

  const { upcoming, past } = await getClientVisits(user.id, new Date());
  const visit = [...upcoming, ...past].find((v) => v.id === appointmentId);

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">Отмена записи</p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!visit && !error && (
        <>
          <h1 className="mb-4 text-xl">Такой записи нет</h1>
          <p className="text-muted mb-8 text-sm">
            Возможно, страница устарела, а запись уже отменена или её
            вообще не было.
          </p>
        </>
      )}

      {visit && !visit.canCancel && (
        <>
          <h1 className="mb-4 text-xl">Эту запись нельзя отменить</h1>
          <p className="text-muted mb-8 text-sm">
            {visit.isCancelled
              ? "Запись уже отменена."
              : "Визит уже состоялся или идёт прямо сейчас — отмена доступна только заранее."}
          </p>
        </>
      )}

      {visit && visit.canCancel && (
        <>
          <h1 className="mb-1 text-xl">Отменить запись?</h1>
          <p className="text-muted mb-8 text-sm">
            {dayLabel(visit.dayKey)}, {visit.timeLabel}
          </p>

          <dl className="border-sand mb-8 grid gap-2 border-b pb-6 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Услуга</dt>
              <dd>{visit.serviceTitle}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Мастер</dt>
              <dd>{visit.masterName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Цена</dt>
              <dd className="font-display tabular-nums">{visit.priceLabel}</dd>
            </div>
          </dl>

          <div className="flex gap-3">
            <form action={cancelVisitAction}>
              <input type="hidden" name="appointmentId" value={visit.id} />
              <button className="button" type="submit">
                Подтвердить отмену
              </button>
            </form>
            <Link className="button button--quiet" href="/account">
              Не отменять
            </Link>
          </div>
        </>
      )}

      {(!visit || !visit.canCancel) && (
        <Link className="underline" href="/account">
          К моим записям
        </Link>
      )}
    </main>
  );
}
