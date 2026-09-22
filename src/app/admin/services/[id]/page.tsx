import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { updateServiceAction } from "../actions";

const ERRORS: Record<string, string> = {
  invalid: "Проверьте поля: название, длительность в минутах и цена в рублях.", // prettier-ignore
  not_found: "Такой услуги уже нет — возможно, страница устарела.",
};

export default async function EditServicePage({
  params,
  searchParams,
}: PageProps<"/admin/services/[id]">) {
  await requireRole(["ADMIN"]);

  const { id } = await params;
  const query = await searchParams;
  const error = typeof query.error === "string" ? ERRORS[query.error] : null;

  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) notFound();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">админка</p>
      <h1 className="mb-8 text-xl">{service.title}</h1>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form action={updateServiceAction}>
        <input type="hidden" name="serviceId" value={service.id} />

        <label className="field">
          <span className="field-label">Название</span>
          <input
            className="field-input"
            type="text"
            name="title"
            defaultValue={service.title}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Описание</span>
          <textarea
            className="field-input"
            name="description"
            rows={3}
            defaultValue={service.description ?? ""}
          />
        </label>

        <label className="field">
          <span className="field-label">Длительность, мин</span>
          <input
            className="field-input"
            type="number"
            name="durationMin"
            min={5}
            max={480}
            step={5}
            defaultValue={service.durationMin}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Цена, ₽</span>
          <input
            className="field-input"
            type="text"
            inputMode="decimal"
            name="priceKopecks"
            defaultValue={(service.priceKopecks / 100).toString()}
            required
          />
        </label>

        <label className="field flex items-center gap-2">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={service.isActive}
          />
          <span className="text-sm">Услуга активна (видна при записи)</span>
        </label>

        <button className="button" type="submit">
          Сохранить
        </button>
      </form>

      <p className="text-muted mt-8 text-xs">
        <Link className="underline" href="/admin/services">
          Назад к списку
        </Link>
      </p>
    </main>
  );
}
