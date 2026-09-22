import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/session";

/*
  Шапка. Серверный компонент: сессия читается здесь же, на клиент
  не уезжает ни данных о пользователе, ни логики проверки.

  Выход — форма, а не ссылка. Ссылка меняла бы состояние по GET:
  её бы дёрнул любой префетч или ускоритель браузера, и человек
  внезапно оказался бы разлогинен.
*/

const ROLE_LABELS: Record<string, string> = {
  MASTER: "мастер",
  ADMIN: "администратор",
};

export async function SiteHeader() {
  const user = await getCurrentUser();
  const roleLabel = user?.role ? ROLE_LABELS[user.role] : undefined;

  return (
    <header className="border-sand border-b">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="font-display text-sm">
          Салон
        </Link>

        {user ? (
          <div className="flex items-center gap-4">
            {/* Кабинет — только мастеру: у клиента такой страницы нет,
                и ссылка на неё вела бы в редирект. */}
            {user.role === "MASTER" && (
              <Link href="/master" className="text-sm">
                Кабинет
              </Link>
            )}
            {user.role === "ADMIN" && (
              <Link href="/admin/services" className="text-sm">
                Админка
              </Link>
            )}
            <Link href="/account" className="text-sm">
              {user.name}
              {roleLabel && (
                <span className="text-muted text-xs"> · {roleLabel}</span>
              )}
            </Link>
            <form action={signOutAction}>
              <button className="button button--quiet" type="submit">
                Выйти
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link className="button button--quiet" href="/signin">
              Войти
            </Link>
            <Link className="button" href="/signup">
              Регистрация
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
