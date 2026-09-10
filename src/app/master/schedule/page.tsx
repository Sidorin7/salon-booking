import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/session";
import { getMasterByUserId, getWeeklySchedule } from "@/services/master";
import { setWorkingHoursAction } from "../actions";

/*
  Недельный график мастера.

  Одна форма на день недели, а не общая на всю неделю: сохранение
  по строке — это семь маленьких, понятных изменений вместо одного
  большого, которое либо применится целиком, либо не применится вовсе.

  Пустые поля времени означают выходной. Отдельного переключателя
  «работаю / не работаю» нет: он дублировал бы то же самое состояние
  вторым способом, и их пришлось бы согласовывать.
*/

const ERRORS: Record<string, string> = {
  bad_range: "Проверьте время: конец смены должен быть позже начала.",
};

/** Минуты от полуночи → «ЧЧ:ММ» для <input type="time">. */
const toTimeValue = (minutes: number | null) =>
  minutes === null
    ? ""
    : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export default async function SchedulePage({
  searchParams,
}: PageProps<"/master/schedule">) {
  const user = await requireRole(["MASTER"]);
  const master = await getMasterByUserId(user.id);

  if (!master) redirect("/");

  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;
  const week = await getWeeklySchedule(master.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">
        {master.displayName} · кабинет мастера
      </p>
      <h1 className="mb-8 text-xl">Недельный график</h1>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <ul>
        {week.map((day) => (
          <li key={day.weekday} className="border-sand border-b py-3">
            <form
              action={setWorkingHoursAction}
              className="flex flex-wrap items-end gap-4"
            >
              <input type="hidden" name="weekday" value={day.weekday} />

              <span className="min-w-32 text-sm">{day.label}</span>

              <label className="field mb-0">
                <span className="field-label">С</span>
                <input
                  className="field-input"
                  type="time"
                  name="startMin"
                  defaultValue={toTimeValue(day.startMin)}
                />
              </label>
              <label className="field mb-0">
                <span className="field-label">До</span>
                <input
                  className="field-input"
                  type="time"
                  name="endMin"
                  defaultValue={toTimeValue(day.endMin)}
                />
              </label>

              <button className="button button--quiet ml-auto" type="submit">
                Сохранить
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p className="text-muted mt-8 text-xs">
        Пустые поля — выходной. Обед и другие перерывы закрываются на{" "}
        <Link className="underline" href="/master">
          странице дня
        </Link>
        : они разовые, а график повторяется каждую неделю. Там же —{" "}
        <Link className="underline" href="/master/stats">
          аналитика
        </Link>
        .
      </p>
    </main>
  );
}
