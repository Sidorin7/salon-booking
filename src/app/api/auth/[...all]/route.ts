/*
  Единственная точка HTTP-API аутентификации.

  Better Auth сам обслуживает весь набор своих эндпоинтов под /api/auth/*
  (вход, регистрация, выход, сессия), поэтому роут — catch-all и в нём
  нет ни строчки нашей логики. Формы страниц входа с этим роутом
  не разговаривают: они идут через Server Action. Роут нужен клиентской
  части библиотеки и как обычный API — например, для мобильного клиента.
*/
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
