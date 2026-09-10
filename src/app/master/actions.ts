"use server";

/*
  Server Actions кабинета мастера.

  По инварианту проекта здесь нет бизнес-логики: сессия и роль,
  валидация, вызов сервиса, revalidatePath. Кто чью запись может
  отменить, решает src/services/master.ts, а можно ли вообще менять
  статус — домен.

  Отдельная тонкость: masterId никогда не приходит из формы. Он берётся
  от сессии — иначе подмена скрытого поля превратила бы кабинет
  в пульт управления чужим расписанием.
*/

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import { SALON_TIMEZONE } from "@/lib/salon";
import {
  parseWallClock,
  salonWallClockToUtc,
} from "@/domain/scheduling/salon-time";
import {
  addTimeOff,
  cancelAppointment,
  clearWorkingHours,
  completeAppointment,
  getMasterByUserId,
  removeTimeOff,
  setWorkingHours,
  type MasterFailure,
} from "@/services/master";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const appointmentInput = z.object({
  appointmentId: z.string().min(1),
  dayKey: z.string().regex(DAY_KEY),
});

/** «ЧЧ:ММ» из <input type="time"> — сразу в минуты от полуночи. */
const wallClock = z.string().transform((value, ctx) => {
  const minutes = parseWallClock(value);

  if (minutes === null) {
    ctx.addIssue({ code: "custom", message: "не время" });
    return z.NEVER;
  }

  return minutes;
});

const workingHoursInput = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  // Поля времени приходят строкой «ЧЧ:ММ», а пустое поле означает
  // выходной — тогда часов у дня просто не остаётся.
  startMin: wallClock.optional(),
  endMin: wallClock.optional(),
});

const timeOffInput = z.object({
  dayKey: z.string().regex(DAY_KEY),
  from: wallClock,
  to: wallClock,
  reason: z.string().trim().max(120).optional(),
});

/** Профиль мастера текущей сессии. */
async function currentMaster() {
  const user = await requireRole(["MASTER"]);
  const master = await getMasterByUserId(user.id);

  // Роль MASTER без профиля — рассогласование данных, а не путь
  // пользователя: показывать ему нечего.
  if (!master) redirect("/");

  return master;
}

/** Куда вернуть человека и что сказать. */
function dayUrl(dayKey: string, error?: MasterFailure) {
  const params = new URLSearchParams({ date: dayKey });
  if (error) params.set("error", error.toLowerCase());

  return `/master?${params}`;
}

function scheduleUrl(error?: MasterFailure) {
  return error ? `/master/schedule?error=${error.toLowerCase()}` : "/master/schedule"; // prettier-ignore
}

export async function cancelAppointmentAction(formData: FormData) {
  const parsed = appointmentInput.safeParse({
    appointmentId: formData.get("appointmentId"),
    dayKey: formData.get("dayKey"),
  });

  if (!parsed.success) redirect("/master");

  const master = await currentMaster();
  const result = await cancelAppointment({
    masterId: master.id,
    appointmentId: parsed.data.appointmentId,
    now: new Date(),
  });

  // Отменённое время освободилось для всех, кто смотрит ленту,
  // и исчезло из «Моих записей» клиента.
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath("/master");

  redirect(dayUrl(parsed.data.dayKey, result.ok ? undefined : result.reason));
}

export async function completeAppointmentAction(formData: FormData) {
  const parsed = appointmentInput.safeParse({
    appointmentId: formData.get("appointmentId"),
    dayKey: formData.get("dayKey"),
  });

  if (!parsed.success) redirect("/master");

  const master = await currentMaster();
  const result = await completeAppointment({
    masterId: master.id,
    appointmentId: parsed.data.appointmentId,
    now: new Date(),
  });

  revalidatePath("/account");
  revalidatePath("/master");

  redirect(dayUrl(parsed.data.dayKey, result.ok ? undefined : result.reason));
}

export async function setWorkingHoursAction(formData: FormData) {
  const raw = {
    weekday: formData.get("weekday"),
    startMin: formData.get("startMin") || undefined,
    endMin: formData.get("endMin") || undefined,
  };
  const parsed = workingHoursInput.safeParse(raw);

  if (!parsed.success) redirect(scheduleUrl("BAD_RANGE"));

  const master = await currentMaster();
  const { weekday, startMin, endMin } = parsed.data;

  const result =
    startMin === undefined || endMin === undefined
      ? await clearWorkingHours({ masterId: master.id, weekday })
      : await setWorkingHours({ masterId: master.id, weekday, startMin, endMin }); // prettier-ignore

  // График меняет ленту дня: смена мастера — её подложка.
  revalidatePath("/");
  revalidatePath("/master/schedule");

  redirect(scheduleUrl(result.ok ? undefined : result.reason));
}

export async function addTimeOffAction(formData: FormData) {
  const parsed = timeOffInput.safeParse({
    dayKey: formData.get("dayKey"),
    from: formData.get("from"),
    to: formData.get("to"),
    reason: formData.get("reason") || undefined,
  });

  // Разбор не удался — вернуть человека всё равно нужно на его день,
  // а не на сегодня: дата в форме уже была, даже если время в ней не время.
  if (!parsed.success) {
    const raw = formData.get("dayKey");
    const back = typeof raw === "string" && DAY_KEY.test(raw) ? raw : null;

    redirect(back ? dayUrl(back, "BAD_RANGE") : "/master");
  }

  const { dayKey, from, to, reason } = parsed.data;

  const master = await currentMaster();
  const result = await addTimeOff({
    masterId: master.id,
    startsAt: salonWallClockToUtc(dayKey, from, SALON_TIMEZONE),
    endsAt: salonWallClockToUtc(dayKey, to, SALON_TIMEZONE),
    reason,
  });

  // Закрытое время исчезает из свободных слотов.
  revalidatePath("/");
  revalidatePath("/master");

  redirect(dayUrl(dayKey, result.ok ? undefined : result.reason));
}

export async function removeTimeOffAction(formData: FormData) {
  const parsed = z
    .object({
      timeOffId: z.string().min(1),
      dayKey: z.string().regex(DAY_KEY),
    })
    .safeParse({
      timeOffId: formData.get("timeOffId"),
      dayKey: formData.get("dayKey"),
    });

  if (!parsed.success) redirect("/master");

  const master = await currentMaster();
  const result = await removeTimeOff({
    masterId: master.id,
    timeOffId: parsed.data.timeOffId,
  });

  revalidatePath("/");
  revalidatePath("/master");

  redirect(dayUrl(parsed.data.dayKey, result.ok ? undefined : result.reason));
}
