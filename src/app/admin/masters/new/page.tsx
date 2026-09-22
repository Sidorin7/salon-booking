import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listAllServices } from "@/services/admin-catalog";
import { createMasterAction } from "../actions";

const ERRORS: Record<string, string> = {
  invalid: "Проверьте поля: имя, email, пароль от 8 символов и отображаемое имя.", // prettier-ignore
  email_taken: "Пользователь с такой почтой уже есть.",
};

export default async function NewMasterPage({
  searchParams,
}: PageProps<"/admin/masters/new">) {
  await requireRole(["ADMIN"]);

  const params = await searchParams;
  const error = typeof params.error === "string" ? ERRORS[params.error] : null;
  const services = await listAllServices();

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">админка</p>
      <h1 className="mb-8 text-xl">Новый мастер</h1>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form action={createMasterAction}>
        <p className="text-muted mb-4 text-xs">Учётка для входа</p>

        <label className="field">
          <span className="field-label">Имя и фамилия</span>
          <input className="field-input" type="text" name="name" required />
        </label>

        <label className="field">
          <span className="field-label">Email</span>
          <input className="field-input" type="email" name="email" required />
        </label>

        <label className="field">
          <span className="field-label">Пароль</span>
          <input
            className="field-input"
            type="text"
            name="password"
            minLength={8}
            required
          />
        </label>

        <p className="text-muted mt-8 mb-4 text-xs">Профиль в салоне</p>

        <label className="field">
          <span className="field-label">Отображаемое имя</span>
          <input
            className="field-input"
            type="text"
            name="displayName"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">О мастере</span>
          <textarea className="field-input" name="bio" rows={3} />
        </label>

        <fieldset className="field">
          <legend className="field-label">Услуги</legend>
          {services.map((service) => (
            <label key={service.id} className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                name="serviceIds"
                value={service.id}
                defaultChecked={false}
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

        <button className="button" type="submit">
          Завести
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
