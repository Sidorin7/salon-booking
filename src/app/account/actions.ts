"use server";

/*
  Server Action отмены своей записи клиентом.

  По инварианту здесь нет бизнес-логики: сессия, валидация, вызов
  сервиса, revalidatePath. Кто может отменить какую запись, решает
  cancelClientAppointment (clientId в where) и домен (canCancel).
*/

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { cancelClientAppointment } from "@/services/appointments";

const cancelInput = z.object({ appointmentId: z.string().min(1) });

function cancelUrl(appointmentId: string, error?: string) {
  const params = new URLSearchParams({ appointmentId });
  if (error) params.set("error", error);

  return `/account/cancel?${params}`;
}

export async function cancelVisitAction(formData: FormData) {
  const parsed = cancelInput.safeParse({
    appointmentId: formData.get("appointmentId"),
  });

  if (!parsed.success) redirect("/account");

  const user = await requireUser();
  const result = await cancelClientAppointment({
    clientId: user.id,
    appointmentId: parsed.data.appointmentId,
    now: new Date(),
  });

  // Отменённое время освободилось для всех, кто смотрит ленту.
  revalidatePath("/");
  revalidatePath("/account");

  if (!result.ok) {
    redirect(cancelUrl(parsed.data.appointmentId, result.reason.toLowerCase()));
  }

  redirect("/account?cancelled=1");
}
