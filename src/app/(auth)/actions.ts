"use server";

/*
  Server Actions входа, регистрации и выхода.

  По инварианту проекта в действии нет бизнес-логики: только валидация,
  вызов сервиса и навигация. Сервисом здесь выступает сам Better Auth —
  ни хеширования, ни выдачи сессий мы руками не делаем.

  Ошибки возвращаются редиректом с кодом в адресе, а не состоянием
  компонента. Так форма остаётся обычной HTML-формой и работает
  без JavaScript: сабмит, редирект, сообщение — весь цикл на сервере.
*/

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

const credentials = z.object({
  email: z.email(),
  // Ниже восьми Better Auth и сам не пропустит: minPasswordLength = 8.
  password: z.string().min(8),
});

const signUpInput = credentials.extend({
  name: z.string().trim().min(2).max(80),
});

/** Куда вернуть человека с сообщением об ошибке. */
function backTo(path: string, error: string, email?: string) {
  const params = new URLSearchParams({ error });
  if (email) params.set("email", email);

  return `${path}?${params}`;
}

export async function signInAction(formData: FormData) {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const email = String(formData.get("email") ?? "");
  const next = safeNext(formData.get("next"));

  if (!parsed.success) {
    redirect(backTo("/signin", "invalid", email));
  }

  let failed = false;

  try {
    await auth.api.signInEmail({ body: parsed.data });
  } catch (error) {
    // Тонкость: redirect() бросает исключение, которое ловит Next.
    // Поэтому внутри try его вызывать нельзя — свой же catch съел бы
    // редирект и превратил бы его в «неизвестную ошибку».
    if (!(error instanceof APIError)) throw error;
    failed = true;
  }

  // Неверный пароль и несуществующая почта отвечают одинаково: разный
  // ответ подсказал бы, какие адреса в базе есть.
  if (failed) redirect(backTo("/signin", "invalid", email));

  redirect(next);
}

export async function signUpAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const parsed = signUpInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(backTo("/signup", "invalid", email));
  }

  let taken = false;

  try {
    // Роль не передаётся и передана быть не может: у поля стоит
    // input: false. Новый пользователь всегда CLIENT.
    await auth.api.signUpEmail({ body: parsed.data });
  } catch (error) {
    if (!(error instanceof APIError)) throw error;
    taken = true;
  }

  if (taken) redirect(backTo("/signup", "taken", email));

  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });

  redirect("/");
}
