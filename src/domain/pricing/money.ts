/**
 * Деньги в проекте — целое число копеек. Дробные типы для денег
 * дают ошибки округления, поэтому рубли появляются только здесь,
 * на границе с экраном.
 */
export function formatKopecks(kopecks: number): string {
  const formatter = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    // Копейки показываем, только когда они не нулевые: у салона цены
    // круглые, и «3 500,00 ₽» в прайсе выглядит бухгалтерским отчётом.
    minimumFractionDigits: kopecks % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  // Intl ставит неразрывный пробел перед знаком валюты — так и надо:
  // «3 500» и «₽» не должны разъезжаться по разным строкам.
  return formatter.format(kopecks / 100);
}
