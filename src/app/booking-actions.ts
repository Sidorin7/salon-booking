"use server";

/*
  Server Action бронирования.

  По инварианту проекта здесь нет бизнес-логики: проверка сессии,
  валидация, вызов сервиса, revalidatePath. Всё, что решает, можно ли
  занять это время, живёт в bookAppointment и в самой базе.
*/

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { bookAppointment, type BookingFailure } from "@/services/booking";

const bookingInput = z.object({
  masterId: z.string().min(1),
  serviceId: z.string().min(1),
  // Время приходит строкой из формы. Доверять ему нельзя: сервис
  // всё равно пересчитает слоты и сверит.
  startsAt: z.iso.datetime(),
  dayKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Куда вернуть человека и что показать. */
function dayUrl(
  dayKey: string,
  serviceId: string,
  extra?: Record<string, string>,
) {
  const params = new URLSearchParams({ date: dayKey, service: serviceId, ...extra }); // prettier-ignore

  return `/?${params}`;
}

export async function bookAction(formData: FormData) {
  const parsed = bookingInput.safeParse({
    masterId: formData.get("masterId"),
    serviceId: formData.get("serviceId"),
    startsAt: formData.get("startsAt"),
    dayKey: formData.get("dayKey"),
  });

  if (!parsed.success) {
    redirect("/");
  }

  const { masterId, serviceId, startsAt, dayKey } = parsed.data;

  const user = await getCurrentUser();

  if (!user) {
    // Гостя отправляем на вход, но помним, куда он шёл: возвращаться
    // на пустую главную после логина — значит искать слот заново.
    const back = encodeURIComponent(dayUrl(dayKey, serviceId));
    redirect(`/signin?next=${back}`);
  }

  const result = await bookAppointment({
    clientId: user.id,
    masterId,
    serviceId,
    startsAt: new Date(startsAt),
    now: new Date(),
  });

  // Лента дня изменилась для всех, кто её сейчас смотрит, а не только
  // для этого клиента: занятое время стало занятым у всех.
  revalidatePath("/");

  if (!result.ok) {
    redirect(dayUrl(dayKey, serviceId, { error: failureCode(result.reason) }));
  }

  revalidatePath("/account");
  redirect("/account?booked=1");
}

/** Коды короче и понятнее в адресной строке, чем внутренние причины. */
function failureCode(reason: BookingFailure): string {
  return reason.toLowerCase();
}
