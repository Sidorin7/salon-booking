/**
 * Куда вернуть человека после входа.
 *
 * Пускаем только свои пути: строка приходит из адреса, и без этой
 * проверки ссылка вида `/signin?next=https://зло.example` увела бы
 * человека на чужой сайт сразу после ввода пароля. Двойной слэш тоже
 * отсекаем — «//зло.example» браузер считает внешним адресом
 * со схемой текущей страницы.
 */
export function safeNext(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/";
}
