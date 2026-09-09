/*
  Доступ к текущей сессии на сервере.

  Помощники нарочно тонкие: они читают сессию и сверяют роль, но не
  решают, что делать дальше. Решение — редирект или 403 — принимает
  страница, потому что только она знает, куда человека вернуть.
*/

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAllowed, parseRole, type Role } from "@/domain/auth/roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
};

/**
 * Текущий пользователь или `null`.
 *
 * Сессия проверяется на сервере при каждом запросе, а не берётся из куки
 * на доверии: кука лишь говорит, что она есть, а действительна ли она —
 * знает только база.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: parseRole(session.user.role),
  };
}

/** Пускает только вошедших; остальных отправляет на вход. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) redirect("/signin");

  return user;
}

/**
 * Пускает только перечисленные роли.
 *
 * Вошедшего, но не той роли, отправляем на главную, а не на страницу
 * входа: он уже вошёл, и повторный вход ничего не изменит — получилась
 * бы петля из редиректов.
 */
export async function requireRole(
  allowed: readonly Role[],
): Promise<CurrentUser> {
  const user = await requireUser();

  if (!isAllowed(user.role, allowed)) redirect("/");

  return user;
}
