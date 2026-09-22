/*
  Админка: заведение мастеров и правка их профиля.

  Учётку заводит auth.api.createUser (плагин admin), а не signUpEmail.
  Ключевая разница: createUser не логинит созданного пользователя и не
  трогает куки. Вызванный из Server Action от имени администратора,
  signUpEmail выставил бы куку сессии нового мастера в тот же ответ —
  плагин nextCookies перекладывает Set-Cookie любого auth.api-вызова
  в куки Next, не разбирая, кто и зачем его сделал. Админ незаметно
  для себя разлогинился бы и оказался залогинен как только что
  созданный мастер.
*/

import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AdminMasterFailure = "NOT_FOUND" | "EMAIL_TAKEN";

export type AdminMasterResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: AdminMasterFailure };

export type AdminMasterRow = {
  id: string;
  displayName: string;
  email: string;
  bio: string | null;
  isActive: boolean;
  serviceTitles: string[];
};

/** Все мастера салона — для списка в админке. */
export async function listMasters(): Promise<AdminMasterRow[]> {
  const masters = await prisma.master.findMany({
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    include: {
      user: { select: { email: true } },
      services: { include: { service: { select: { title: true } } } },
    },
  });

  return masters.map((master) => ({
    id: master.id,
    displayName: master.displayName,
    email: master.user.email,
    bio: master.bio,
    isActive: master.isActive,
    serviceTitles: master.services.map((row) => row.service.title),
  }));
}

export type CreateMasterInput = {
  name: string;
  email: string;
  password: string;
  displayName: string;
  bio: string | null;
  serviceIds: string[];
};

export async function createMaster(
  input: CreateMasterInput,
): Promise<AdminMasterResult<{ masterId: string }>> {
  let userId: string;

  try {
    const created = await auth.api.createUser({
      body: {
        name: input.name,
        email: input.email,
        password: input.password,
        // Плагин admin типизирует role как "user" | "admin" — своими
        // ролями (CLIENT/MASTER/ADMIN, из additionalFields.role) он не
        // знает. Мы не пользуемся его правами и access control, только
        // самим методом createUser, так что строка всё равно уходит
        // как есть — приведение типа только для компилятора.
        role: "MASTER" as "user" | "admin",
        data: { emailVerified: true },
      },
    });
    userId = created.user.id;
  } catch (error) {
    if (error instanceof APIError) return { ok: false, reason: "EMAIL_TAKEN" };
    throw error;
  }

  const master = await prisma.master.create({
    data: {
      userId,
      displayName: input.displayName,
      bio: input.bio,
      services: {
        create: input.serviceIds.map((serviceId) => ({ serviceId })),
      },
    },
    select: { id: true },
  });

  return { ok: true, masterId: master.id };
}

export type UpdateMasterInput = {
  displayName: string;
  bio: string | null;
  serviceIds: string[];
  isActive: boolean;
};

export async function updateMaster(
  masterId: string,
  input: UpdateMasterInput,
): Promise<AdminMasterResult> {
  const master = await prisma.master.findUnique({
    where: { id: masterId },
    select: { id: true },
  });

  if (!master) return { ok: false, reason: "NOT_FOUND" };

  await prisma.$transaction([
    prisma.master.update({
      where: { id: masterId },
      data: {
        displayName: input.displayName,
        bio: input.bio,
        isActive: input.isActive,
      },
    }),
    // Набор услуг пересобирается целиком: разница «что добавили, что
    // убрали» здесь не нужна — та же схема, что и у графика мастера
    // (setWorkingHours: deleteMany + create в одной транзакции).
    prisma.masterService.deleteMany({ where: { masterId } }),
    prisma.masterService.createMany({
      data: input.serviceIds.map((serviceId) => ({ masterId, serviceId })),
    }),
  ]);

  return { ok: true };
}
