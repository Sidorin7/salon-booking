import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL не задан. Скопируйте .env.example в .env и поднимите базу: docker compose up -d",
  );
}

const createPrismaClient = () =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/**
 * В dev-режиме Next перезагружает модули при каждом сохранении файла.
 * Без этого кэша каждая правка создавала бы новый PrismaClient со своим
 * пулом соединений, и база довольно быстро начала бы отказывать
 * в подключениях. В проде модуль загружается один раз, кэш не нужен.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
