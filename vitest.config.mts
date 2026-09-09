import "dotenv/config";
import { defineConfig } from "vitest/config";

/*
  Два вида тестов с разной ценой запуска, поэтому и два проекта.

  domain — чистые функции, миллисекунды, гоняются постоянно.
  integration — настоящий PostgreSQL: только так проверяется защита
  от гонки, потому что ловит её EXCLUDE-констрейнт, а не наш код.

  Запуск: npm test (всё), npm run test:unit (только домен).
*/
export default defineConfig({
  resolve: {
    // Алиас "@/*" из tsconfig — Vite читает его сам, плагин не нужен.
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "domain",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          globalSetup: ["tests/db/global-setup.ts"],
          setupFiles: ["tests/db/reset.ts"],
          // База одна на весь прогон: параллельные файлы вычищали бы
          // данные друг у друга посреди чужого теста.
          fileParallelism: false,
          // Поднять базу и накатить миграции дольше, чем посчитать
          // пару чистых функций.
          testTimeout: 20_000,
          hookTimeout: 30_000,
          env: {
            // Подменяем строку подключения целиком: код приложения
            // читает DATABASE_URL и знать не знает про тестовую базу.
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
            // Явно, а не «как в .env»: тест про часовые пояса не должен
            // менять исход от настроек чужой машины.
            SALON_TIMEZONE: process.env.SALON_TIMEZONE ?? "Europe/Moscow",
          },
        },
      },
    ],
  },
});
