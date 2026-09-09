/*
  Фикстуры для интеграционных тестов: минимальный салон.

  Пишем напрямую в базу, минуя Better Auth: тестам нужен пользователь
  как строка в таблице, а не возможность войти под ним. Хеш пароля здесь
  был бы лишней секундой на каждый тест.
*/

import { prisma } from "@/lib/prisma";
import { SALON_TIMEZONE } from "@/lib/salon";
import { salonWallClockToUtc } from "@/domain/scheduling/salon-time";

let counter = 0;
const uniq = () => `test-${Date.now()}-${counter++}`;

export async function makeUser(role: "CLIENT" | "MASTER" = "CLIENT") {
  const id = uniq();

  return prisma.user.create({
    data: { id, name: `Пользователь ${id}`, email: `${id}@salon.test`, role },
  });
}

export async function makeService(durationMin: number, priceKopecks = 100_000) {
  return prisma.service.create({
    data: { title: `Услуга ${durationMin} мин`, durationMin, priceKopecks },
  });
}

/**
 * Мастер с графиком и списком услуг.
 * `weekdays` — как `Date.getDay()`: 0 воскресенье, 3 среда.
 */
export async function makeMaster(options: {
  serviceIds: string[];
  weekdays: number[];
  startMin: number;
  endMin: number;
}) {
  const user = await makeUser("MASTER");

  return prisma.master.create({
    data: {
      userId: user.id,
      displayName: `Мастер ${user.id}`,
      services: {
        create: options.serviceIds.map((serviceId) => ({ serviceId })),
      },
      workingHours: {
        create: options.weekdays.map((weekday) => ({
          weekday,
          startMin: options.startMin,
          endMin: options.endMin,
        })),
      },
    },
  });
}

/** Момент по часам салона: `at("2026-09-16", 10, 30)` — 10:30. */
export function at(dayKey: string, hours: number, minutes = 0) {
  return salonWallClockToUtc(dayKey, hours * 60 + minutes, SALON_TIMEZONE);
}
