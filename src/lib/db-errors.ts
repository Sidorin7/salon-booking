/*
  Разбор ошибок записи от PostgreSQL через Prisma.

  Вынесено из сервиса по двум причинам. Во-первых, это чистая функция,
  и её можно проверить всеми формами ошибок сразу, не воспроизводя
  гонку в базе. Во-вторых, форма ошибки — свойство связки Prisma 7 +
  драйвер-адаптер, а не бизнес-логики бронирования.
*/

import { Prisma } from "@/generated/prisma/client";

/** Имя констрейнта из ручного SQL в первой миграции. */
const OVERLAP_CONSTRAINT = "appointment_no_overlap";

export type WriteFailure =
  /** Время пересеклось с существующей записью. */
  | "OVERLAP"
  /** Взаимоблокировка или конфликт записи: тот же слот писали параллельно. */
  | "CONFLICT";

/**
 * Prisma 7 с драйвер-адаптером не поднимает код PostgreSQL наверх:
 * сверху оказывается `P2039`, а настоящий код лежит в
 * `meta.driverAdapterError.cause`. Проверять только `error.code`
 * бесполезно — P2039 приходит и на десяток других причин.
 *
 * Исключение — `40001`: его Prisma переводит в свой `P2034` сама,
 * а вот `40P01` (взаимоблокировка) в таблицу соответствий не попал.
 * Поэтому смотреть приходится в оба места.
 */
export function classifyWriteError(error: unknown): WriteFailure | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  if (error.code === "P2034") return "CONFLICT";

  const cause = (
    error.meta as { driverAdapterError?: { cause?: Record<string, unknown> } }
  )?.driverAdapterError?.cause;

  if (!cause) return null;

  if (cause.code === "40001" || cause.code === "40P01") return "CONFLICT";

  if (
    cause.code === "23P01" &&
    String(cause.message ?? "").includes(OVERLAP_CONSTRAINT)
  ) {
    return "OVERLAP";
  }

  return null;
}
