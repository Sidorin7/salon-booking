"use server";

/*
  Server Actions админки мастеров.

  По инварианту здесь нет бизнес-логики: сессия и роль, валидация,
  вызов сервиса, revalidatePath. Само заведение учётки (auth.api.createUser,
  без автовхода и без куки — см. комментарий в src/services/admin-masters.ts)
  тоже спрятано в сервисе, а не здесь.
*/

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import {
  createMaster,
  updateMaster,
  type AdminMasterFailure,
} from "@/services/admin-masters";

/** Из формы приходят строки "on" по одной на каждый отмеченный чекбокс. */
const serviceIds = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value],
  );

const profileFields = z.object({
  displayName: z.string().trim().min(2).max(80),
  // Пустое поле — очистка bio, а не «оставить как было»: как и description
  // у услуги, undefined в Prisma-update пропустил бы поле.
  bio: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value === "" ? null : value)),
  serviceIds,
});

const createInput = profileFields.extend({
  name: z.string().trim().min(2).max(80),
  email: z.email(),
  password: z.string().min(8),
});

function newUrl(error: string) {
  return `/admin/masters/new?error=${error}`;
}

function editUrl(masterId: string, error: string) {
  return `/admin/masters/${masterId}?error=${error}`;
}

export async function createMasterAction(formData: FormData) {
  await requireRole(["ADMIN"]);

  const parsed = createInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    serviceIds: formData.getAll("serviceIds"),
  });

  if (!parsed.success) redirect(newUrl("invalid"));

  const result = await createMaster(parsed.data);

  if (!result.ok) redirect(newUrl(result.reason.toLowerCase()));

  revalidatePath("/admin/masters");
  redirect("/admin/masters");
}

export async function updateMasterAction(formData: FormData) {
  await requireRole(["ADMIN"]);

  const masterId = String(formData.get("masterId") ?? "");
  const parsed = profileFields.safeParse({
    displayName: formData.get("displayName"),
    bio: formData.get("bio"),
    serviceIds: formData.getAll("serviceIds"),
  });

  if (!masterId || !parsed.success) redirect(editUrl(masterId, "invalid"));

  const isActive = formData.get("isActive") === "on";
  const result = await updateMaster(masterId, { ...parsed.data, isActive });

  revalidatePath("/admin/masters");
  revalidatePath("/"); // отключённый мастер должен исчезнуть из ленты дня

  if (!result.ok) {
    const reason: AdminMasterFailure = result.reason;
    redirect(editUrl(masterId, reason.toLowerCase()));
  }

  redirect("/admin/masters");
}
