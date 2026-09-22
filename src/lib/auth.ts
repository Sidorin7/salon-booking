import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins/admin";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    // Учебный проект: почту не подтверждаем, писем пока не шлём.
    requireEmailVerification: false,
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "CLIENT",
        /**
         * Ключевая настройка. input: false запрещает передавать роль
         * с клиента при регистрации — иначе любой желающий отправил бы
         * форму с role: "ADMIN" и получил доступ ко всему салону.
         * Повысить роль можно только из базы или админки.
         */
        input: false,
      },
    },
  },

  plugins: [
    /**
     * Даёт auth.api.createUser — им админка заводит мастеров.
     * В отличие от signUpEmail, этот эндпойнт не логинит созданного
     * пользователя: куку сессии не трогает, поэтому вызов из Server
     * Action не разлогинивает администратора самого себя. Ролями
     * и правами плагина не пользуемся — только этим одним методом,
     * вызванным без сессии (как в prisma/seed.ts).
     */
    // defaultRole обязателен: без него плагин подставляет свой "user"
    // при СОЗДАНИИ ЛЮБОГО пользователя (не только через createUser),
    // а его не пропустит CHECK-констрейнт — у нас роли CLIENT/MASTER/ADMIN.
    admin({ defaultRole: "CLIENT" }),
    /**
     * Обязательно последним в списке. Плагин перекладывает Set-Cookie,
     * который вернул эндпоинт, в куки Next. Без него вход через
     * Server Action «проходит» — и не оставляет сессии: куку просто
     * некому поставить.
     */
    nextCookies(),
  ],
});
