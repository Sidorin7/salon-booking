import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/*
  В Next 16 middleware переименован в proxy; поведение прежнее.
  Файл лежит рядом с app/ — на проект он ровно один.

  Здесь только оптимистичная проверка: есть ли кука сессии. Действительна
  ли она, знает лишь база, и ходить в неё отсюда нельзя — proxy выполняется
  на каждый запрос, включая статику. Поэтому настоящая проверка живёт
  в requireUser()/requireRole() на страницах, а здесь — только удобство:
  не показывать форму входа тому, кто уже вошёл.

  Из этого следует правило: ничего секретного этим файлом не защищается.
  Подделанная кука пройдёт proxy и упрётся в проверку на странице.
*/

const GUEST_ONLY = ["/signin", "/signup"];

export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;

  if (hasSession && GUEST_ONLY.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/signin", "/signup"],
};
