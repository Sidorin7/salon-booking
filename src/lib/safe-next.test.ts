import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("пропускает свои пути", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/?date=2026-09-16&service=abc")).toBe(
      "/?date=2026-09-16&service=abc",
    );
  });

  it("не выпускает на чужой сайт", () => {
    // Без этой проверки ссылка /signin?next=... уводила бы человека
    // на чужой сайт сразу после ввода пароля.
    expect(safeNext("https://зло.example")).toBe("/");
    // Двойной слэш браузер считает внешним адресом со схемой текущей
    // страницы — это та же дыра, только незаметнее.
    expect(safeNext("//зло.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("на мусоре возвращает главную", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(["/a", "/b"])).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});
