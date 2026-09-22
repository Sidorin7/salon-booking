import Link from "next/link";
import { requireRole } from "@/lib/session";
import { createServiceAction } from "../actions";

const ERRORS: Record<string, string> = {
  invalid: "Проверьте поля: название, длительность в минутах и цена в рублях.", // prettier-ignore
};

export default async function NewServicePage({
  searchParams,
}: PageProps<"/admin/services/new">) {
  await requireRole(["ADMIN"]);

  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">админка</p>
      <h1 className="mb-8 text-xl">Новая услуга</h1>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form action={createServiceAction}>
        <label className="field">
          <span className="field-label">Название</span>
          <input className="field-input" type="text" name="title" required />
        </label>

        <label className="field">
          <span className="field-label">Описание</span>
          <textarea className="field-input" name="description" rows={3} />
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
            placeholder="1500"
            required
          />
        </label>

        <button className="button" type="submit">
          Создать
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
