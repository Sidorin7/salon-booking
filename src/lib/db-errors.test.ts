import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { classifyWriteError } from "./db-errors";

/*
  Формы ошибок здесь не выдуманы, а сняты с живой базы — см. PROGRESS.md.
  Prisma 7 с драйвер-адаптером не поднимает код PostgreSQL наверх:
  сверху лежит P2039, а настоящий код — в meta.driverAdapterError.cause.
*/

const adapterError = (code: string, message: string) =>
  new Prisma.PrismaClientKnownRequestError("Database error", {
    code: "P2039",
    clientVersion: "7.10.0",
    meta: { driverAdapterError: { cause: { code, message } } },
  });

describe("classifyWriteError", () => {
  it("узнаёт пересечение по констрейнту", () => {
    const error = adapterError(
      "23P01",
      'conflicting key value violates exclusion constraint "appointment_no_overlap"',
    );

    expect(classifyWriteError(error)).toBe("OVERLAP");
  });

  it("не считает пересечением чужой констрейнт", () => {
    // Появится второй EXCLUDE — и «занято» стало бы значить что-то другое.
    const error = adapterError(
      "23P01",
      'conflicting key value violates exclusion constraint "some_other_rule"',
    );

    expect(classifyWriteError(error)).toBeNull();
  });

  it("узнаёт конфликт записи по коду Prisma", () => {
    // 40001 Prisma переводит в свой P2034 сама.
    const error = new Prisma.PrismaClientKnownRequestError(
      "Transaction failed due to a write conflict or a deadlock",
      { code: "P2034", clientVersion: "7.10.0" },
    );

    expect(classifyWriteError(error)).toBe("CONFLICT");
  });

  it("узнаёт взаимоблокировку, которую Prisma не переводит", () => {
    // 40P01 в таблицу соответствий не попал и приезжает как P2039.
    expect(classifyWriteError(adapterError("40P01", "deadlock detected"))).toBe(
      "CONFLICT",
    );
  });

  it("возвращает null на всём остальном", () => {
    expect(classifyWriteError(adapterError("23505", "duplicate key"))).toBeNull();
    expect(classifyWriteError(new Error("что-то другое"))).toBeNull();
    expect(classifyWriteError(null)).toBeNull();
  });
});
