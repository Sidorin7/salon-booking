import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Алиас "@/*" из tsconfig — Vite читает его сам, плагин не нужен.
    tsconfigPaths: true,
  },
  test: {
    // Домен — чистые функции без DOM. Браузерное окружение здесь
    // только замедляло бы запуск.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
