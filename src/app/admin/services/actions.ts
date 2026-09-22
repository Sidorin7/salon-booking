"use server";

/*
  Server Actions админки услуг.

  По инварианту здесь нет бизнес-логики: сессия и роль, валидация,
  вызов сервиса, revalidatePath. Отключение услуги и правку цены
  делает сервисный слой (src/services/admin-catalog.ts).
*/

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { parseRublesToKopecks } from "@/domain/pricing/money";
import {
  createService,
  updateService,
  type AdminFailure,
  type ServiceInput,
} from "@/services/admin-catalog";

/** Цена приходит строкой в рублях — разбирает parseRublesToKopecks. */
const price = z.string().transform((value, ctx) => {
  const kopecks = parseRublesToKopecks(value);

  if (kopecks === null) {
    ctx.addIssue({ code: "custom", message: "не цена" });
    return z.NEVER;
  }

  return kopecks;
});

const serviceInput = z.object({
  title: z.string().trim().min(2).max(120),
  // Пустое поле формы — очистка описания, а не «оставить как было»:
  // отсутствие ключа в data пропустило бы поле, а нам нужно стереть.
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => (value === "" ? null : value)),
  durationMin: z.coerce.number().int().min(5).max(8 * 60),
  priceKopecks: price,
});

function serviceInputFromForm(formData: FormData): ServiceInput | null {
  const parsed = serviceInput.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    durationMin: formData.get("durationMin"),
    priceKopecks: formData.get("priceKopecks"),
  });

  return parsed.success ? parsed.data : null;
}

function listUrl(error?: AdminFailure) {
  return error ? `/admin/services?error=${error.toLowerCase()}` : "/admin/services"; // prettier-ignore
}

function newUrl(error: string) {
  return `/admin/services/new?error=${error}`;
}

function editUrl(serviceId: string, error: string) {
  return `/admin/services/${serviceId}?error=${error}`;
}

export async function createServiceAction(formData: FormData) {
  await requireRole(["ADMIN"]);

  const input = serviceInputFromForm(formData);
  if (!input) redirect(newUrl("invalid"));

  await createService(input);

  revalidatePath("/admin/services");
  redirect(listUrl());
}

export async function updateServiceAction(formData: FormData) {
  await requireRole(["ADMIN"]);

  const serviceId = String(formData.get("serviceId") ?? "");
  const input = serviceInputFromForm(formData);

  if (!serviceId || !input) redirect(editUrl(serviceId, "invalid"));

  const isActive = formData.get("isActive") === "on";
  const result = await updateService(serviceId, { ...input, isActive });

  revalidatePath("/admin/services");

  if (!result.ok) redirect(editUrl(serviceId, result.reason.toLowerCase()));

  redirect(listUrl());
}
