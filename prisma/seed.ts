/*
  Сид-скрипт: наполняет базу салоном, на который можно смотреть.

  Запуск: npx prisma db seed  (команда прописана в prisma.config.ts)

  Два принципа, из которых выросла вся структура файла:

  1. Скрипт идемпотентен. Он сначала сносит свои данные, потом создаёт
     заново, поэтому его можно гонять сколько угодно раз подряд.

  2. Время записей скрипт не выдумывает, а спрашивает у доменной функции
     computeAvailableSlots. Руками расставленные «10:00, 12:00, 14:30»
     рано или поздно наложились бы друг на друга или на обед, и сид
     упал бы на EXCLUDE-констрейнте. Так он не может нарушить его
     в принципе — а заодно мы каждый запуск проверяем домен на живой базе.
*/

import "dotenv/config";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SALON_TIMEZONE, SLOT_STEP_MIN } from "@/lib/salon";
import { computeAvailableSlots } from "@/domain/scheduling/slots";
import {
  salonDayKey,
  salonWallClockToUtc,
  shiftDayKey,
  weekdayOfDayKey,
} from "@/domain/scheduling/salon-time";

/** Общий домен тестовых учёток: по нему же они и удаляются. */
const TEST_EMAIL_DOMAIN = "salon.test";
/** Пароль у всех тестовых пользователей один — это учебная база. */
const TEST_PASSWORD = "password123";

const MINUTE_MS = 60_000;
const hm = (hours: number, minutes = 0) => hours * 60 + minutes;

// ─── Данные салона ────────────────────────────────────────────────────

const services = [
  {
    key: "haircut-women",
    title: "Женская стрижка",
    description: "Мытьё, стрижка, укладка феном",
    durationMin: 60,
    priceKopecks: 350_000,
  },
  {
    key: "haircut-men",
    title: "Мужская стрижка",
    description: "Машинка и ножницы, оформление бороды по желанию",
    durationMin: 45,
    priceKopecks: 220_000,
  },
  {
    key: "styling",
    title: "Укладка",
    description: "Локоны, гладкая укладка или объём",
    durationMin: 45,
    priceKopecks: 190_000,
  },
  {
    key: "coloring",
    title: "Окрашивание в один тон",
    description: "Корни и длина, уход после окрашивания",
    durationMin: 150,
    priceKopecks: 790_000,
  },
  {
    key: "highlights",
    title: "Сложное окрашивание",
    description: "Мелирование, шатуш, тонирование",
    durationMin: 210,
    priceKopecks: 1_150_000,
  },
  {
    key: "manicure",
    title: "Маникюр с покрытием",
    description: "Аппаратный маникюр, гель-лак",
    durationMin: 90,
    priceKopecks: 320_000,
  },
] as const;

type ServiceKey = (typeof services)[number]["key"];

/** 1 — понедельник, 6 — суббота, 0 — воскресенье (как Date.getDay()). */
const masters = [
  {
    key: "anna",
    name: "Анна Ковалёва",
    email: `anna@${TEST_EMAIL_DOMAIN}`,
    displayName: "Анна",
    bio: "Колорист. Работает со сложными окрашиваниями и блондом.",
    services: [
      "haircut-women",
      "styling",
      "coloring",
      "highlights",
    ] satisfies ServiceKey[],
    schedule: [
      { weekdays: [2, 3, 4, 5], startMin: hm(10), endMin: hm(20) },
      { weekdays: [6], startMin: hm(11), endMin: hm(17) },
    ],
  },
  {
    key: "marat",
    name: "Марат Гилязов",
    email: `marat@${TEST_EMAIL_DOMAIN}`,
    displayName: "Марат",
    bio: "Мужские стрижки и оформление бороды. Барбер с 2016 года.",
    services: [
      "haircut-men",
      "haircut-women",
      "styling",
    ] satisfies ServiceKey[],
    schedule: [{ weekdays: [1, 2, 3, 4, 5], startMin: hm(11), endMin: hm(21) }],
  },
  {
    key: "olga",
    name: "Ольга Стрельцова",
    email: `olga@${TEST_EMAIL_DOMAIN}`,
    displayName: "Ольга",
    bio: "Ногтевой сервис, аппаратный маникюр.",
    services: ["manicure"] satisfies ServiceKey[],
    schedule: [{ weekdays: [3, 4, 5, 6, 0], startMin: hm(9), endMin: hm(18) }],
  },
] as const;

const clients = [
  { name: "Дарья Мельникова", email: `darya@${TEST_EMAIL_DOMAIN}` },
  { name: "Игорь Пестов", email: `igor@${TEST_EMAIL_DOMAIN}` },
  { name: "Камила Юсупова", email: `kamila@${TEST_EMAIL_DOMAIN}` },
];

const admin = { name: "Администратор", email: `admin@${TEST_EMAIL_DOMAIN}` };

/**
 * Что и кому записать. День задаётся сдвигом от сегодня, а не датой:
 * иначе через неделю сид создавал бы записи в прошлом.
 */
const bookings: Array<{
  masterKey: (typeof masters)[number]["key"];
  serviceKey: ServiceKey;
  dayOffset: number;
  clientIndex: number;
  note?: string;
}> = [
  { masterKey: "anna", serviceKey: "highlights", dayOffset: 0, clientIndex: 0 },
  { masterKey: "anna", serviceKey: "haircut-women", dayOffset: 0, clientIndex: 2 }, // prettier-ignore
  { masterKey: "anna", serviceKey: "coloring", dayOffset: 1, clientIndex: 2 },
  { masterKey: "marat", serviceKey: "haircut-men", dayOffset: 0, clientIndex: 1, note: "Как в прошлый раз, короче по бокам." }, // prettier-ignore
  { masterKey: "marat", serviceKey: "haircut-men", dayOffset: 0, clientIndex: 0 }, // prettier-ignore
  { masterKey: "marat", serviceKey: "styling", dayOffset: 1, clientIndex: 2 },
  { masterKey: "olga", serviceKey: "manicure", dayOffset: 0, clientIndex: 2 },
  { masterKey: "olga", serviceKey: "manicure", dayOffset: 1, clientIndex: 0 },
];

// ─── Вспомогательное ──────────────────────────────────────────────────

/**
 * Создаёт пользователя через Better Auth, а не напрямую в базе.
 *
 * Прямой prisma.user.create не создал бы запись в `account` с хешем
 * пароля — учётка была бы в базе, но войти под ней было бы нельзя.
 * Хеширование к тому же должно совпадать с тем, чем библиотека потом
 * проверяет пароль; повторять его руками — напрашиваться на расхождение.
 */
async function createUser(name: string, email: string, role: string) {
  const { user } = await auth.api.signUpEmail({
    body: { name, email, password: TEST_PASSWORD },
  });

  // Роль отдельным запросом: в конфигурации Better Auth у поля role
  // стоит input: false, оно намеренно не принимается со стороны клиента.
  return prisma.user.update({
    where: { id: user.id },
    data: { role, emailVerified: true },
  });
}

async function wipe() {
  // Порядок важен: сначала то, что ссылается, потом то, на что ссылаются.
  // На appointment.service стоит onDelete: Restrict — услугу с записями
  // база удалить не даст, и это правильно.
  await prisma.appointment.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.workingHours.deleteMany();
  await prisma.masterService.deleteMany();
  await prisma.master.deleteMany();
  await prisma.service.deleteMany();
  // Сессии и аккаунты уйдут каскадом за пользователем.
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
  });
}

// ─── Основной сценарий ────────────────────────────────────────────────

async function main() {
  const today = salonDayKey(new Date(), SALON_TIMEZONE);

  console.log(`Сид: сегодня в салоне ${today} (${SALON_TIMEZONE})`);
  await wipe();

  // 1. Услуги
  const serviceByKey = new Map<ServiceKey, { id: string; durationMin: number; priceKopecks: number; title: string }>(); // prettier-ignore

  for (const service of services) {
    const created = await prisma.service.create({
      data: {
        title: service.title,
        description: service.description,
        durationMin: service.durationMin,
        priceKopecks: service.priceKopecks,
      },
    });
    serviceByKey.set(service.key, created);
  }

  // 2. Мастера: пользователь с ролью MASTER + профиль + услуги + график
  const masterByKey = new Map<string, { id: string }>();

  for (const master of masters) {
    const user = await createUser(master.name, master.email, "MASTER");

    const created = await prisma.master.create({
      data: {
        userId: user.id,
        displayName: master.displayName,
        bio: master.bio,
        services: {
          create: master.services.map((key) => ({
            serviceId: serviceByKey.get(key)!.id,
          })),
        },
        workingHours: {
          create: master.schedule.flatMap((block) =>
            block.weekdays.map((weekday) => ({
              weekday,
              startMin: block.startMin,
              endMin: block.endMin,
            })),
          ),
        },
      },
    });

    masterByKey.set(master.key, created);
  }

  // 3. Клиенты и администратор
  const clientRecords = [];
  for (const client of clients) {
    clientRecords.push(await createUser(client.name, client.email, "CLIENT"));
  }
  await createUser(admin.name, admin.email, "ADMIN");

  // 4. Обед у Анны сегодня. Заодно проверим, что расчёт слотов его видит:
  //    записи ниже обязаны его обойти.
  const annaId = masterByKey.get("anna")!.id;
  await prisma.timeOff.create({
    data: {
      masterId: annaId,
      startsAt: salonWallClockToUtc(today, hm(14), SALON_TIMEZONE),
      endsAt: salonWallClockToUtc(today, hm(15), SALON_TIMEZONE),
      reason: "Обед",
    },
  });

  // 5. Записи. Время каждой берётся из первого свободного слота,
  //    посчитанного доменной функцией на текущем состоянии дня.
  let created = 0;

  for (const booking of bookings) {
    const master = masters.find((m) => m.key === booking.masterKey)!;
    const masterId = masterByKey.get(booking.masterKey)!.id;
    const service = serviceByKey.get(booking.serviceKey)!;
    const dayKey = shiftDayKey(today, booking.dayOffset);
    const weekday = weekdayOfDayKey(dayKey);

    const workingHours = master.schedule
      .filter((block) => block.weekdays.some((day) => day === weekday))
      .map((block) => ({
        start: salonWallClockToUtc(dayKey, block.startMin, SALON_TIMEZONE),
        end: salonWallClockToUtc(dayKey, block.endMin, SALON_TIMEZONE),
      }));

    if (workingHours.length === 0) {
      console.log(`  · ${master.displayName}: ${dayKey} — выходной, пропуск`);
      continue;
    }

    const dayStart = workingHours[0].start;
    const dayEnd = workingHours[workingHours.length - 1].end;

    const [timeOff, busy] = await Promise.all([
      prisma.timeOff.findMany({
        where: { masterId, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
        select: { startsAt: true, endsAt: true },
      }),
      prisma.appointment.findMany({
        where: {
          masterId,
          status: { not: "CANCELLED" },
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    const toInterval = (row: { startsAt: Date; endsAt: Date }) => ({
      start: row.startsAt,
      end: row.endsAt,
    });

    const slots = computeAvailableSlots({
      workingHours,
      timeOff: timeOff.map(toInterval),
      busy: busy.map(toInterval),
      serviceDurationMin: service.durationMin,
      stepMin: SLOT_STEP_MIN,
      // Начало смены как «сейчас» и нулевой запас: сид наполняет и
      // сегодняшнее утро тоже, иначе половина ленты была бы пустой.
      now: dayStart,
      minLeadTimeMin: 0,
    });

    if (slots.length === 0) {
      console.log(
        `  · ${master.displayName}: ${dayKey} — нет окна под «${service.title}», пропуск`,
      );
      continue;
    }

    const startsAt = slots[0];

    await prisma.appointment.create({
      data: {
        masterId,
        clientId: clientRecords[booking.clientIndex].id,
        serviceId: service.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + service.durationMin * MINUTE_MS),
        priceKopecksAtBooking: service.priceKopecks,
        durationMinAtBooking: service.durationMin,
        clientNote: booking.note,
      },
    });

    created += 1;
  }

  // 6. История: завершённые визиты за прошлые HISTORY_DAYS дней —
  //    чтобы аналитике (и салона, и отдельного мастера) было что
  //    показывать. Записи из шага 5 все ещё предстоящие (CONFIRMED),
  //    а выручка считается только по COMPLETED — без истории график
  //    и сводка стояли бы на нулях.
  //
  //    По одной записи на каждый рабочий день каждого мастера, время —
  //    начало смены: прошлые дни не пересекаются ни друг с другом
  //    (разные календарные дни), ни с записями из шага 5 (те — сегодня
  //    и завтра), так что EXCLUDE-констрейнт тут не в игре и можно
  //    писать без проверки занятости, в отличие от шага 5.
  const HISTORY_DAYS = 90;
  let historyCreated = 0;
  let historyCancelled = 0;

  for (const master of masters) {
    const serviceKeys = master.services;

    for (let offset = 1; offset <= HISTORY_DAYS; offset += 1) {
      const dayKey = shiftDayKey(today, -offset);
      const weekday = weekdayOfDayKey(dayKey);
      const block = master.schedule.find((b) =>
        b.weekdays.some((day) => day === weekday),
      );

      if (!block) continue; // выходной по графику

      const serviceKey = serviceKeys[offset % serviceKeys.length];
      const service = serviceByKey.get(serviceKey)!;
      const shiftLen = block.endMin - block.startMin;

      if (service.durationMin > shiftLen) continue; // услуга не влезает в смену

      const startsAt = salonWallClockToUtc(dayKey, block.startMin, SALON_TIMEZONE); // prettier-ignore
      // Каждый седьмой визит — отменённый: аналитике нужна не только
      // выручка, но и ненулевая доля отмен.
      const cancelled = offset % 7 === 0;

      await prisma.appointment.create({
        data: {
          masterId: masterByKey.get(master.key)!.id,
          clientId: clientRecords[offset % clientRecords.length].id,
          serviceId: service.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + service.durationMin * MINUTE_MS), // prettier-ignore
          status: cancelled ? "CANCELLED" : "COMPLETED",
          priceKopecksAtBooking: service.priceKopecks,
          durationMinAtBooking: service.durationMin,
        },
      });

      if (cancelled) historyCancelled += 1;
      else historyCreated += 1;
    }
  }

  console.log(
    `Готово: ${services.length} услуг, ${masters.length} мастера, ` +
      `${clients.length} клиента, 1 администратор, ${created} записей, ` +
      `${historyCreated} завершённых визитов за историю (${HISTORY_DAYS} дней), ` +
      `${historyCancelled} отменённых.`,
  );
  console.log(`Вход в любую учётку: <имя>@${TEST_EMAIL_DOMAIN} / ${TEST_PASSWORD}`); // prettier-ignore
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
