import type { CSSProperties } from "react";
import Link from "next/link";
import { SLOT_STEP_MIN } from "@/lib/salon";
import type { DaySchedule, RibbonEntry, SlotOffer } from "@/services/schedule";

/*
  Лента дня.

  Высота блока равна длительности услуги: окрашивание на три часа втрое
  выше стрижки на час. Это единственное место в проекте, где дизайн
  говорит громко, — зато загруженность дня читается без чтения цифр.

  Компонент не считает пиксели. Он выставляет две переменные — с какой
  минуты (--from) и сколько минут (--len), — а перевод в пиксели делает
  globals.css. Правило проекта: значений размера в компонентах нет.

  Разметка при этом остаётся обычным списком: для скринридера колонка
  мастера — перечень «услуга, с такого-то по такое-то», а не картинка.
*/

/** Ниже этой длительности в блок помещается только время. */
const COMPACT_THRESHOLD_MIN = 50;

type ScaleVars = CSSProperties & {
  "--from"?: number;
  "--len"?: number;
};

const scale = (fromMin: number, lengthMin: number): ScaleVars => ({
  "--from": fromMin,
  "--len": lengthMin,
});

function Block({ entry }: { entry: RibbonEntry }) {
  const modifier = entry.isCancelled
    ? "ribbon-block--cancelled"
    : entry.kind === "timeOff"
      ? "ribbon-block--off"
      : "";

  return (
    <li
      className={`ribbon-scale ribbon-block ${modifier}`}
      style={scale(entry.fromMin, entry.durationMin)}
    >
      <span className="ribbon-block-time">{entry.timeLabel}</span>
      {entry.durationMin >= COMPACT_THRESHOLD_MIN && (
        <span className="ribbon-block-title">{entry.title}</span>
      )}
      {/* Название короткого блока не пропадает совсем — оно остаётся
          доступным скринридеру и всплывающей подсказке. */}
      {entry.durationMin < COMPACT_THRESHOLD_MIN && (
        <span className="sr-only">{entry.title}</span>
      )}
    </li>
  );
}

/**
 * Слот — настоящая ссылка в списке, а не раскрашенный div.
 * Визуально это лента, но для клавиатуры и скринридера — обычный
 * перечень времени, по которому можно пройти без мыши.
 *
 * Ведёт на экран подтверждения, а не бронирует сразу по клику:
 * человек должен увидеть «к кому и на сколько», прежде чем время
 * займётся. Сама бронь — на следующем экране, действием bookAction.
 */
function Slot({
  slot,
  masterId,
  serviceId,
  dayKey,
}: {
  slot: SlotOffer;
  masterId: string;
  serviceId: string;
  dayKey: string;
}) {
  const confirmUrl = `/booking/confirm?${new URLSearchParams({
    masterId,
    serviceId,
    startsAt: slot.startsAt,
    dayKey,
  })}`;

  return (
    <li className="ribbon-scale" style={scale(slot.fromMin, SLOT_STEP_MIN)}>
      <Link
        className="ribbon-scale ribbon-slot"
        style={scale(slot.fromMin, SLOT_STEP_MIN)}
        href={confirmUrl}
      >
        {slot.label}
      </Link>
    </li>
  );
}

export function DayRibbon({
  schedule,
  serviceId,
}: {
  schedule: DaySchedule;
  /** Пока услуга не выбрана, лента только показывает день. */
  serviceId?: string;
}) {
  return (
    <>
      {/* Мастера, которые эту услугу оказывают, но свободного времени
          сегодня у них нет — не пропадают из вида совсем (иначе не
          отличить «занят сегодня» от «уволился»), но и не тянут за
          собой пустую ленту: просто список имён. */}
      {serviceId && schedule.busyMasters.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Заняты сегодня">
          {schedule.busyMasters.map((master) => (
            <li key={master.masterId}>
              <span className="chip chip--busy">
                {master.displayName}
                <span className="chip-meta">занят сегодня</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
      {/* Декоративный дубль текстовой подсказки над лентой — та уже
          доступна скринридеру, здесь только для тех, кто читает
          глазами саму ленту, а не подпись над ней. */}
      {!serviceId && (
        <div className="ribbon-overlay" aria-hidden="true">
          <p className="ribbon-overlay-text">Сначала выберите услугу</p>
        </div>
      )}

      <div
        className={`flex gap-4 overflow-x-auto pb-4 ${serviceId ? "" : "ribbon-disabled"}`}
      >
      {/* Часовая линейка. aria-hidden: цифры «10, 11, 12» без контекста
          только засоряют озвучку — время каждого блока и так названо. */}
      <div
        className="ribbon-canvas w-8 shrink-0"
        style={scale(0, schedule.lengthMin)}
        aria-hidden="true"
      >
        {schedule.hourMarks.map((mark) => (
          <span
            key={mark.fromMin}
            className="ribbon-scale ribbon-hour-label"
            style={scale(mark.fromMin, 0)}
          >
            {mark.label}
          </span>
        ))}
      </div>

      {schedule.columns.map((column) => (
        <section key={column.masterId} className="min-w-40 flex-1">
          <h2 className="text-lg">{column.displayName}</h2>
          <p className="text-muted mb-3 text-xs">
            {column.shiftLabel ?? "Выходной"}
          </p>

          <div
            className="ribbon-canvas"
            style={scale(0, schedule.lengthMin)}
            aria-hidden={column.shift === null}
          >
            {column.shift && (
              <span
                className="ribbon-scale ribbon-shift"
                style={scale(column.shift.fromMin, column.shift.durationMin)}
              />
            )}

            {schedule.hourMarks.map((mark) => (
              <span
                key={mark.fromMin}
                className="ribbon-scale ribbon-hour"
                style={scale(mark.fromMin, 0)}
              />
            ))}

            {schedule.nowMin !== null && (
              <span
                className="ribbon-scale ribbon-now"
                style={scale(schedule.nowMin, 0)}
              />
            )}

            {column.shift && (
              <ul className="absolute inset-x-0 top-0 bottom-0">
                {column.entries.map((entry) => (
                  <Block key={entry.id} entry={entry} />
                ))}
              </ul>
            )}

            {serviceId && column.slots.length > 0 && (
              <ul
                className="absolute inset-x-0 top-0 bottom-0"
                aria-label={`Свободное время: ${column.displayName}`}
              >
                {column.slots.map((slot) => (
                  <Slot
                    key={slot.startsAt}
                    slot={slot}
                    masterId={column.masterId}
                    serviceId={serviceId}
                    dayKey={schedule.dayKey}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
      </div>
      </div>
    </>
  );
}
