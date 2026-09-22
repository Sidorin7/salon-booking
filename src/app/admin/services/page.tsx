import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listAllServices } from "@/services/admin-catalog";

/*
  Список услуг салона — первая часть админки.

  Показывает и отключённые услуги (в отличие от прайса на главной):
  иначе отключённую услугу нельзя было бы найти и снова включить.
  Удаления нет: Service — Restrict со стороны записи, история важнее
  чистоты списка. Отключение (isActive) для этого и есть.
*/

const ERRORS: Record<string, string> = {
  not_found: "Такой услуги уже нет — возможно, страница устарела.",
};

export default async function AdminServicesPage({
  searchParams,
}: PageProps<"/admin/services">) {
  await requireRole(["ADMIN"]);

  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;
  const services = await listAllServices();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">
        админка ·{" "}
        <Link className="underline" href="/admin/masters">
          мастера
        </Link>{" "}
        ·{" "}
        <Link className="underline" href="/admin/stats">
          аналитика
        </Link>
      </p>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl">Услуги</h1>
        <Link className="button" href="/admin/services/new">
          Создать услугу
        </Link>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <ul>
        {services.map((service) => (
          <li
            key={service.id}
            className="border-sand flex items-center justify-between gap-4 border-b py-3"
          >
            <div>
              <p className="text-sm">
                {service.title}
                {!service.isActive && (
                  <span className="text-muted text-xs"> · отключена</span>
                )}
              </p>
              <p className="text-muted text-xs">
                {service.durationMin} мин · {service.priceLabel}
              </p>
            </div>
            <Link
              className="button button--quiet"
              href={`/admin/services/${service.id}`}
            >
              Изменить
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
