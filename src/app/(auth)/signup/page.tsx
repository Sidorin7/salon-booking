import Link from "next/link";
import { signUpAction } from "../actions";

const MESSAGES: Record<string, string> = {
  invalid: "Проверьте поля: имя от двух букв, пароль от восьми символов.",
  taken: "Такая почта уже занята. Возможно, вы уже регистрировались.",
};

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? MESSAGES[params.error] : null;
  const email = typeof params.email === "string" ? params.email : "";

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="mb-2 text-xl">Регистрация</h1>
      <p className="text-muted mb-8 text-sm">
        Нужна, чтобы записаться и видеть свои визиты.
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form action={signUpAction}>
        <label className="field">
          <span className="field-label">Как к вам обращаться</span>
          <input
            className="field-input"
            type="text"
            name="name"
            autoComplete="name"
            minLength={2}
            maxLength={80}
            required
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field-label">Почта</span>
          <input
            className="field-input"
            type="email"
            name="email"
            defaultValue={email}
            autoComplete="email"
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Пароль, от 8 символов</span>
          <input
            className="field-input"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        <button className="button" type="submit">
          Зарегистрироваться
        </button>
      </form>

      <p className="text-muted mt-8 text-sm">
        Уже регистрировались?{" "}
        <Link className="underline" href="/signin">
          Войти
        </Link>
      </p>
    </main>
  );
}
