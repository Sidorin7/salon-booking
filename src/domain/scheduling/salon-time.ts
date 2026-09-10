import { TZDate } from "@date-fns/tz";

/**
 * Календарный день салона в виде `YYYY-MM-DD`.
 *
 * Это гражданская дата, а не момент времени: у «9 сентября» нет часового
 * пояса, пока мы не назовём час. Отдельный тип нужен, чтобы `Date`
 * с его скрытым UTC-смещением не подменил собой понятие «день».
 */
export type DayKey = string;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDayKey(dayKey: DayKey) {
  const match = DAY_KEY_PATTERN.exec(dayKey);

  if (!match) {
    throw new Error(`Ожидалась дата в формате YYYY-MM-DD, получено: ${dayKey}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Собирает `YYYY-MM-DD` из компонентов гражданской даты.
 */
export function toDayKey(year: number, month: number, day: number): DayKey {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Переводит время по настенным часам салона в момент времени UTC.
 *
 * Это единственное место конвертации в проекте. Рабочие часы хранятся
 * минутами от полуночи по времени салона, все моменты в базе — UTC;
 * стык между этими двумя мирами обязан быть ровно один, иначе всё
 * работает до ближайшего перевода часов.
 *
 * @param minutesFromMidnight минуты от полуночи, 600 — это 10:00
 */
export function salonWallClockToUtc(
  dayKey: DayKey,
  minutesFromMidnight: number,
  timeZone: string,
): Date {
  const { year, month, day } = parseDayKey(dayKey);
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;

  // Часы и минуты передаются конструктору, а не прибавляются к полуночи
  // миллисекундами: в день перевода часов сутки длятся не 24 часа,
  // и «полночь плюс 600 минут» дала бы 09:00 или 11:00 вместо 10:00.
  const local = new TZDate(year, month - 1, day, hours, minutes, 0, 0, timeZone);

  return new Date(local.getTime());
}

/**
 * Какой календарный день сейчас в салоне.
 *
 * В 23:30 UTC в Москве уже завтра — «сегодня» нельзя брать из `new Date()`
 * на сервере, который живёт в UTC.
 */
export function salonDayKey(instant: Date, timeZone: string): DayKey {
  const local = new TZDate(instant, timeZone);

  return toDayKey(local.getFullYear(), local.getMonth() + 1, local.getDate());
}

/**
 * Время момента по часам салона, `ЧЧ:ММ`.
 */
export function formatSalonTime(instant: Date, timeZone: string): string {
  const local = new TZDate(instant, timeZone);

  return `${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

/**
 * День недели гражданской даты: 0 — воскресенье, 6 — суббота.
 * Совпадает с `Date.getDay()` и с полем `weekday` в графике мастера.
 */
export function weekdayOfDayKey(dayKey: DayKey): number {
  const { year, month, day } = parseDayKey(dayKey);

  // Через UTC — часовой пояс машины не должен влиять на день недели.
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * Соседний день: `shiftDayKey("2026-09-09", 1)` — завтра.
 * Арифметика по UTC, поэтому перевод часов её не сдвигает.
 */
export function shiftDayKey(dayKey: DayKey, days: number): DayKey {
  const { year, month, day } = parseDayKey(dayKey);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  return toDayKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/**
 * «ЧЧ:ММ» с настенных часов → минуты от полуночи. `null`, если это не время.
 *
 * `<input type="time">` присылает именно такую строку, но полагаться
 * на браузер нельзя: форму можно отправить и мимо него. Возврат `null`
 * вместо исключения — потому что для сервера это ожидаемый ввод,
 * а не поломка.
 */
export function parseWallClock(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Дни периода, включая оба конца. Перевёрнутый период пуст.
 *
 * Арифметика по UTC, как и в `shiftDayKey`: перевод часов не должен
 * ни удваивать день, ни терять его.
 */
export function eachDayKey(from: DayKey, to: DayKey): DayKey[] {
  const days: DayKey[] = [];

  for (let day = from; day <= to; day = shiftDayKey(day, 1)) {
    days.push(day);
  }

  return days;
}
