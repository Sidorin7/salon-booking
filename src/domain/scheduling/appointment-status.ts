/*
  Переходы статуса записи.

  Чистые правила, без Prisma: сервис только читает статус из базы
  и спрашивает здесь, можно ли его менять.

  CONFIRMED — единственное состояние, из которого есть выходы.
  CANCELLED и COMPLETED конечны: «передумать обратно» нельзя, иначе
  отменённое время начнёт то освобождаться, то занимать снова.
*/

/** Совпадает с enum AppointmentStatus в схеме. */
export type AppointmentStatus = "CONFIRMED" | "CANCELLED" | "COMPLETED";

type Visit = { startsAt: Date; endsAt: Date };

/**
 * Отменить можно, пока визит не закончился — в том числе прямо во время,
 * если клиент не пришёл.
 *
 * После окончания отмена закрыта намеренно: состоявшийся визит,
 * отменённый одним нажатием, тихо уменьшил бы выручку за прошлый месяц.
 * Для завершившегося визита остаётся «завершить».
 */
export function canCancel(
  status: AppointmentStatus,
  visit: Visit,
  now: Date,
): boolean {
  return status === "CONFIRMED" && now < visit.endsAt;
}

/** Завершить можно только то, что уже началось. */
export function canComplete(
  status: AppointmentStatus,
  visit: Visit,
  now: Date,
): boolean {
  return status === "CONFIRMED" && now >= visit.startsAt;
}
