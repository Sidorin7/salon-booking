import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { SALON_TIMEZONE } from "@/lib/salon";
import { getMasterByUserId, getMasterDay } from "@/services/master";
import { salonDayKey, shiftDayKey } from "@/domain/scheduling/salon-time";
import {
  addTimeOffAction,
  cancelAppointmentAction,
  completeAppointmentAction,
  removeTimeOffAction,
} from "./actions";

/*
  Кабинет мастера: его день.

  Не лента, а список. Лента отвечает на вопрос «когда свободно» —
  его задаёт клиент. Мастер задаёт другой: «кто придёт и что с ними
  делать», и на него отвечает перечень со временем, именем и заметкой.
  Рисовать здесь ту же ленту значило бы повторить форму ради формы.

  Первый потребитель requireRole(["MASTER"]). Иерархии ролей в проекте
  нет намеренно: админ сюда не попадает — тут чужие клиенты и чужая
  выручка.
*/

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ERRORS: Record<string, string> = {
  not_found: "Такой записи у вас нет. Возможно, страница устарела — обновите её.", // prettier-ignore
  not_allowed:
    "Так изменить эту запись нельзя: завершают только начавшийся визит, отменяют — только не завершившийся.",
  bad_range: "Проверьте время: конец должен быть позже начала.",
  covers_appointment:
    "На это время есть подтверждённая запись. Сначала отмените её — клиент должен узнать об отмене, а не обнаружить закрытую дверь.",
};

const STATUS_LABELS: Record<string, string> = {
  CANCELLED: "отменена",
  COMPLETED: "завершена",
};

const dayTitle = (dayKey: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC", // ключ — гражданская дата, часовой пояс тут ни при чём
  }).format(new Date(`${dayKey}T00:00:00Z`));

export default async function MasterPage({
  searchParams,
}: PageProps<"/master">) {
  const user = await requireRole(["MASTER"]);
  const master = await getMasterByUserId(user.id);

  // Роль есть, профиля нет — рассогласование данных: показывать нечего.
  if (!master) redirect("/");

  const now = new Date();
  const today = salonDayKey(now, SALON_TIMEZONE);
  const params = await searchParams;

  const requested = params.date;
  const dayKey =
    typeof requested === "string" && DAY_KEY_PATTERN.test(requested)
      ? requested
      : today;

  const error = typeof params.error === "string" ? ERRORS[params.error] : null;
  const { appointments, timeOff } = await getMasterDay(master.id, dayKey, now);

  const dayLink = (date: string) => `/master?date=${date}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-muted text-xs">
            {master.displayName} · кабинет мастера
          </p>
          <h1 className="text-xl first-letter:uppercase">{dayTitle(dayKey)}</h1>
        </div>

        <nav aria-label="Выбор дня" className="flex items-center gap-2">
          <Link
            className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
            href={dayLink(shiftDayKey(dayKey, -1))}
            aria-label="Предыдущий день"
          >
            ←
          </Link>
          {dayKey !== today && (
            <Link
              className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
              href={dayLink(today)}
            >
              Сегодня
            </Link>
          )}
          <Link
            className="border-sand hover:border-ink rounded-full border px-3 py-1 text-sm"
            href={dayLink(shiftDayKey(dayKey, 1))}
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

      <h2 className="mb-2 text-lg">Записи</h2>
      {appointments.length > 0 ? (
        <ul className="mb-10">
          {appointments.map((visit) => (
            <li key={visit.id} className="border-sand border-b py-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-display text-sm tabular-nums">
                  {visit.timeLabel}
                </span>
                <span
                  className={
                    visit.status === "CANCELLED" ? "text-muted line-through" : ""
                  }
                >
                  {visit.serviceTitle}
                </span>
                <span className="text-muted text-sm">{visit.clientName}</span>
                {STATUS_LABELS[visit.status] && (
                  <span className="text-muted text-xs">
                    · {STATUS_LABELS[visit.status]}
                  </span>
                )}
                <span className="font-display ml-auto text-sm tabular-nums">
                  {visit.priceLabel}
                </span>
              </div>

              {/* Заметка клиента — то, ради чего мастер вообще открывает
                  этот список: «аллергия на аммиак» важнее цены. */}
              {visit.clientNote && (
                <p className="text-muted mt-1 text-sm">{visit.clientNote}</p>
              )}

              {(visit.canComplete || visit.canCancel) && (
                <div className="mt-2 flex gap-2">
                  {visit.canComplete && (
                    <form action={completeAppointmentAction}>
                      <input type="hidden" name="appointmentId" value={visit.id} />
                      <input type="hidden" name="dayKey" value={dayKey} />
                      <button className="button button--quiet" type="submit">
                        Завершить
                      </button>
                    </form>
                  )}
                  {visit.canCancel && (
                    <form action={cancelAppointmentAction}>
                      <input type="hidden" name="appointmentId" value={visit.id} />
                      <input type="hidden" name="dayKey" value={dayKey} />
                      <button className="button button--quiet" type="submit">
                        Отменить
                      </button>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted mb-10 text-sm">В этот день записей нет.</p>
      )}

      <h2 className="mb-2 text-lg">Закрытое время</h2>
      {timeOff.length > 0 && (
        <ul className="mb-4">
          {timeOff.map((off) => (
            <li
              key={off.id}
              className="border-sand flex flex-wrap items-baseline gap-x-4 border-b py-3"
            >
              <span className="font-display text-sm tabular-nums">
                {off.timeLabel}
              </span>
              <span className="text-muted text-sm">
                {off.reason ?? "Без причины"}
              </span>
              <form action={removeTimeOffAction} className="ml-auto">
                <input type="hidden" name="timeOffId" value={off.id} />
                <input type="hidden" name="dayKey" value={dayKey} />
                <button className="button button--quiet" type="submit">
                  Открыть
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={addTimeOffAction}
        className="flex flex-wrap items-end gap-4 pt-2"
      >
        <input type="hidden" name="dayKey" value={dayKey} />
        <label className="field mb-0">
          <span className="field-label">С</span>
          <input className="field-input" type="time" name="from" required />
        </label>
        <label className="field mb-0">
          <span className="field-label">До</span>
          <input className="field-input" type="time" name="to" required />
        </label>
        <label className="field mb-0 flex-1">
          <span className="field-label">Причина, если нужна</span>
          <input
            className="field-input"
            type="text"
            name="reason"
            maxLength={120}
            placeholder="обед, учёба, врач"
          />
        </label>
        <button className="button" type="submit">
          Закрыть время
        </button>
      </form>

      <p className="text-muted mt-8 text-xs">
        <Link className="underline" href="/master/schedule">
          Недельный график
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/master/stats">
          Аналитика
        </Link>
      </p>
    </main>
  );
}
