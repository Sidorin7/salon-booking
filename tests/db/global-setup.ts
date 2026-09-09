/*
  Готовит базу для интеграционных тестов: создаёт salon_test, если её нет,
  и накатывает миграции. Выполняется один раз на весь прогон.

  Почему отдельная база в том же контейнере, а не Testcontainers: гонку
  за слот ловит EXCLUDE-констрейнт, то есть нужен настоящий PostgreSQL,
  но не нужен новый контейнер на каждый прогон. Так тесты стартуют
  мгновенно, а заглянуть в базу можно тем же psql, что и в рабочую.
*/

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;

  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL не задан. Скопируйте .env.example в .env — интеграционным тестам нужна отдельная база.",
    );
  }

  const testDbName = new URL(url).pathname.slice(1);

  // Подключаемся к рабочей базе, чтобы создать соседнюю: CREATE DATABASE
  // нельзя выполнить, будучи подключённым к создаваемой базе.
  const admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();

  try {
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [testDbName],
    );

    if (exists.rowCount === 0) {
      // Имя базы нельзя подставить параметром — это идентификатор,
      // а не значение. Поэтому оно берётся из TEST_DATABASE_URL
      // и проверяется на допустимые символы.
      if (!/^[a-z0-9_]+$/i.test(testDbName)) {
        throw new Error(`Недопустимое имя тестовой базы: ${testDbName}`);
      }
      await admin.query(`CREATE DATABASE "${testDbName}"`);
    }
  } finally {
    await admin.end();
  }

  // migrate deploy, а не migrate dev: тестовой базе не нужны ни диалоги,
  // ни генерация новых миграций — только применить существующие,
  // включая ручной SQL с EXCLUDE в конце первой из них.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
