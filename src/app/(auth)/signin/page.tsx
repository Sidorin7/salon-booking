import Link from "next/link";
import { signInAction } from "../actions";

/*
  Вход. Обычная HTML-форма с Server Action: без JavaScript тоже работает.
  Сообщение об ошибке приходит из адреса — его туда положило действие.
*/

const MESSAGES: Record<string, string> = {
  invalid: "Не подошла почта или пароль. Проверьте раскладку и попробуйте ещё раз.",
};

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? MESSAGES[params.error] : null;
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-8 text-xl">Вход</h1>

      {/* role="alert": без него человек, вернувшийся на страницу после
          редиректа, узнает об ошибке только глазами. */}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form action={signInAction}>
        <label className="field">
          <span className="field-label">Почта</span>
          <input
            className="field-input"
            type="email"
            name="email"
            defaultValue={email}
            autoComplete="email"
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field-label">Пароль</span>
          <input
            className="field-input"
            type="password"
            name="password"
            autoComplete="current-password"
            minLength={8}
            required
          />
        </label>

        <button className="button" type="submit">
          Войти
        </button>
      </form>

      <p className="text-muted mt-8 text-sm">
        Ещё нет учётной записи?{" "}
        <Link className="underline" href="/signup">
          Зарегистрироваться
        </Link>
      </p>
    </main>
  );
}
