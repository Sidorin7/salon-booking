/*
  Чистит таблицы перед каждым интеграционным тестом.

  TRUNCATE, а не удаление базы: пересоздавать её на каждый тест — секунды
  вместо миллисекунд. CASCADE снимает вопрос порядка внешних ключей,
  RESTART IDENTITY возвращает счётчики к началу.

  Прогон идёт в один поток (fileParallelism: false в конфиге): база одна
  на всех, и параллельные файлы чистили бы данные друг у друга.
*/

import { beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";

const TABLES = [
  "appointment",
  "time_off",
  "working_hours",
  "master_service",
  "master",
  "service",
  "session",
  "account",
  "verification",
  "user",
];

beforeEach(async () => {
  const list = TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
