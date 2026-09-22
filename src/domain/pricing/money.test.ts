import { describe, expect, it } from "vitest";
import { formatKopecks, parseRublesToKopecks } from "./money";

/*
  Пробелы в ожиданиях — неразрывные (U+00A0), и записаны escape-
  последовательностью намеренно. Intl разделяет и разряды, и знак валюты
  именно ими, а на глаз это неотличимо от обычного пробела: тест
  с «3 500 ₽» падал бы с сообщением «ожидалось 3 500 ₽, получено 3 500 ₽».
*/
const NBSP = " ";

describe("formatKopecks", () => {
  it("показывает круглую сумму без копеек", () => {
    // Цены в салоне круглые, и «3 500,00 ₽» в прайсе выглядит бухгалтерией.
    expect(formatKopecks(350_000)).toBe(`3${NBSP}500${NBSP}₽`);
  });

  it("показывает копейки, только если они есть", () => {
    expect(formatKopecks(350_050)).toBe(`3${NBSP}500,50${NBSP}₽`);
  });

  it("не теряет разряды на больших суммах", () => {
    expect(formatKopecks(11_500_000)).toBe(`115${NBSP}000${NBSP}₽`);
  });

  it("умеет ноль", () => {
    expect(formatKopecks(0)).toBe(`0${NBSP}₽`);
  });
});

describe("parseRublesToKopecks", () => {
  it("разбирает целое число рублей", () => {
    expect(parseRublesToKopecks("1500")).toBe(150_000);
  });

  it("разбирает рубли с копейками через точку", () => {
    expect(parseRublesToKopecks("1500.50")).toBe(150_050);
  });

  it("разбирает рубли с копейками через запятую", () => {
    // Форма — русская, и в цене человек скорее наберёт запятую.
    expect(parseRublesToKopecks("1500,5")).toBe(150_050);
  });

  it("прощает пробелы по краям", () => {
    expect(parseRublesToKopecks("  350  ")).toBe(35_000);
  });

  it("отвергает мусор", () => {
    expect(parseRublesToKopecks("бесплатно")).toBeNull();
  });

  it("отвергает пустую строку", () => {
    expect(parseRublesToKopecks("")).toBeNull();
  });

  it("отвергает ноль и отрицательные суммы", () => {
    // Цена — обязательная часть услуги, ноль и минус не имеют смысла.
    expect(parseRublesToKopecks("0")).toBeNull();
    expect(parseRublesToKopecks("-100")).toBeNull();
  });

  it("отвергает больше двух знаков после запятой", () => {
    // Копейка — минимальная единица; «15,505» ничему не соответствует.
    expect(parseRublesToKopecks("15.505")).toBeNull();
  });
});
