import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listMasters } from "@/services/admin-masters";

/*
  Список мастеров салона.

  Показывает и отключённых (isActive: false) — иначе отключённого
  мастера нельзя было бы найти и снова включить. Удаления нет по той же
  причине, что и у услуг: история записей мастера не должна исчезать.
*/

const ERRORS: Record<string, string> = {
  not_found: "Такого мастера уже нет — возможно, страница устарела.",
};

export default async function AdminMastersPage({
  searchParams,
}: PageProps<"/admin/masters">) {
  await requireRole(["ADMIN"]);

  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;
  const masters = await listMasters();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">
        админка ·{" "}
        <Link className="underline" href="/admin/services">
          услуги
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/admin/stats">
          аналитика
        </Link>
      </p>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl">Мастера</h1>
        <Link className="button" href="/admin/masters/new">
          Завести мастера
        </Link>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <ul>
        {masters.map((master) => (
          <li
            key={master.id}
            className="border-sand flex items-center justify-between gap-4 border-b py-3"
          >
            <div>
              <p className="text-sm">
                {master.displayName}
                {!master.isActive && (
                  <span className="text-muted text-xs"> · отключён</span>
                )}
              </p>
              <p className="text-muted text-xs">
                {master.email}
                {master.serviceTitles.length > 0 &&
                  ` · ${master.serviceTitles.join(", ")}`}
              </p>
            </div>
            <Link
              className="button button--quiet"
              href={`/admin/masters/${master.id}`}
            >
              Изменить
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
