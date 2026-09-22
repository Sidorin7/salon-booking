import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listAllServices } from "@/services/admin-catalog";
import { updateMasterAction } from "../actions";

const ERRORS: Record<string, string> = {
  invalid: "Проверьте отображаемое имя — оно обязательно.",
  not_found: "Такого мастера уже нет — возможно, страница устарела.",
};

export default async function EditMasterPage({
  params,
  searchParams,
}: PageProps<"/admin/masters/[id]">) {
  await requireRole(["ADMIN"]);

  const { id } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  const [master, services] = await Promise.all([
    prisma.master.findUnique({
      where: { id },
      include: {
        user: { select: { email: true } },
        services: { select: { serviceId: true } },
      },
    }),
    listAllServices(),
  ]);

  if (!master) notFound();

  const selectedServiceIds = new Set(master.services.map((s) => s.serviceId));

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">админка</p>
      <h1 className="mb-1 text-xl">{master.displayName}</h1>
      <p className="text-muted mb-8 text-xs">{master.user.email}</p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form action={updateMasterAction}>
        <input type="hidden" name="masterId" value={master.id} />

        <label className="field">
          <span className="field-label">Отображаемое имя</span>
          <input
            className="field-input"
            type="text"
            name="displayName"
            defaultValue={master.displayName}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">О мастере</span>
          <textarea
            className="field-input"
            name="bio"
            rows={3}
            defaultValue={master.bio ?? ""}
          />
        </label>

        <fieldset className="field">
          <legend className="field-label">Услуги</legend>
          {services.map((service) => (
            <label key={service.id} className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                name="serviceIds"
                value={service.id}
                defaultChecked={selectedServiceIds.has(service.id)}
              />
              <span className="text-sm">
                {service.title}
                {!service.isActive && (
                  <span className="text-muted text-xs"> · отключена</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>

        <label className="field flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={master.isActive}
          />
          <span className="text-sm">
            Мастер активен (виден в ленте дня)
          </span>
        </label>

        <button className="button" type="submit">
          Сохранить
        </button>
      </form>

      <p className="text-muted mt-8 text-xs">
        <Link className="underline" href="/admin/masters">
          Назад к списку
        </Link>
      </p>
    </main>
  );
}
