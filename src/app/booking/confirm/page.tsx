import Link from "next/link";
import { redirect } from "next/navigation";
import { bookAction } from "@/app/booking-actions";
import { getBookingPreview } from "@/services/booking";

/*
  Экран подтверждения брони.

  Клик по слоту в ленте раньше бронировал сразу — теперь он ведёт сюда:
  человек должен увидеть «к кому и на сколько», прежде чем время
  займётся. Сама бронь происходит по кнопке «Подтвердить» — тем же
  bookAction, что и раньше, без изменений в нём самом.

  Данные — в адресе, не в состоянии компонента: страницу можно
  обновить или прислать ссылкой, и она покажет то же самое (или честно
  скажет, что время утекло, если кто-то успел раньше).
*/

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dayLabel = (dayKey: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC", // ключ — гражданская дата, часовой пояс тут ни при чём
  }).format(new Date(`${dayKey}T00:00:00Z`));

function backUrl(dayKey: string, serviceId: string) {
  return `/?${new URLSearchParams({ date: dayKey, service: serviceId })}`;
}

export default async function BookingConfirmPage({
  searchParams,
}: PageProps<"/booking/confirm">) {
  const params = await searchParams;

  const masterId = typeof params.masterId === "string" ? params.masterId : "";
  const serviceId = typeof params.serviceId === "string" ? params.serviceId : ""; // prettier-ignore
  const dayKey = typeof params.dayKey === "string" ? params.dayKey : "";
  const startsAtRaw = typeof params.startsAt === "string" ? params.startsAt : ""; // prettier-ignore
  const startsAt = new Date(startsAtRaw);

  // Мусор или подделанная ссылка — на главную, а не в ошибку: страница
  // подтверждения не место для разбора чужого ввода.
  if (
    !masterId ||
    !serviceId ||
    !DAY_KEY_PATTERN.test(dayKey) ||
    Number.isNaN(startsAt.getTime())
  ) {
    redirect("/");
  }

  const preview = await getBookingPreview({
    masterId,
    serviceId,
    startsAt,
    now: new Date(),
  });

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <p className="text-muted text-xs">Подтверждение записи</p>

      {!preview && (
        <>
          <h1 className="mb-4 text-xl">Не удалось найти это время</h1>
          <p className="text-muted mb-8 text-sm">
            Этот мастер не оказывает выбранную услугу, либо услуга или
            мастер сейчас отключены. Вернитесь и выберите другое время.
          </p>
          <Link className="button" href={backUrl(dayKey, serviceId)}>
            Назад к ленте
          </Link>
        </>
      )}

      {preview && !preview.available && (
        <>
          <h1 className="mb-4 text-xl">Это время уже заняли</h1>
          <p className="text-muted mb-8 text-sm">
            Пока вы выбирали, это время у {preview.masterName} заняли —
            буквально только что. Вернитесь и выберите другое.
          </p>
          <Link className="button" href={backUrl(dayKey, serviceId)}>
            Назад к ленте
          </Link>
        </>
      )}

      {preview && preview.available && (
        <>
          <h1 className="mb-1 text-xl">Записаться к {preview.masterName}?</h1>
          <p className="text-muted mb-8 text-sm">
            {dayLabel(dayKey)}, {preview.timeLabel}
          </p>

          <dl className="border-sand mb-8 grid gap-2 border-b pb-6 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Услуга</dt>
              <dd>{preview.serviceTitle}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Мастер</dt>
              <dd>{preview.masterName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Время</dt>
              <dd>{preview.timeLabel}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Цена</dt>
              <dd className="font-display tabular-nums">{preview.priceLabel}</dd>
            </div>
          </dl>

          <div className="flex gap-3">
            <form action={bookAction}>
              <input type="hidden" name="masterId" value={masterId} />
              <input type="hidden" name="serviceId" value={serviceId} />
              <input type="hidden" name="startsAt" value={startsAtRaw} />
              <input type="hidden" name="dayKey" value={dayKey} />
              <button className="button" type="submit">
                Подтвердить
              </button>
            </form>
            <Link
              className="button button--quiet"
              href={backUrl(dayKey, serviceId)}
            >
              Отмена
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
