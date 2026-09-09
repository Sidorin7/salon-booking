/*
  Роли салона.

  Чистая логика без Prisma и Next: роль приезжает из базы строкой,
  и всё, что с ней можно сделать, — разобрать и сравнить со списком.
*/

/** Порядка в списке нет: иерархии ролей в проекте нет. */
export const ROLES = ["CLIENT", "MASTER", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

/**
 * Разбирает значение из базы. Всё неизвестное — `null`, а не исключение:
 * поле `role` объявлено как `String` (так его создаёт Better Auth),
 * и хотя целостность стережёт CHECK-констрейнт, доверять этому в коде
 * нельзя — база переживёт и ручной UPDATE.
 */
export function parseRole(value: unknown): Role | null {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value)
    ? (value as Role)
    : null;
}

/**
 * Разрешён ли доступ роли из явного списка.
 *
 * Иерархии нет намеренно: ADMIN не «старше» MASTER и в кабинет мастера
 * сам собой не попадает. У мастера там свои записи и своя выручка —
 * если админу это нужно, роль выписывается в списке явно.
 */
export function isAllowed(
  role: Role | null,
  allowed: readonly Role[],
): boolean {
  return role !== null && allowed.includes(role);
}
