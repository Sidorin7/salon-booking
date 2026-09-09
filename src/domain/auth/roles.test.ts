import { describe, expect, it } from "vitest";
import { isAllowed, parseRole } from "./roles";

describe("parseRole", () => {
  it("узнаёт три роли салона", () => {
    expect(parseRole("CLIENT")).toBe("CLIENT");
    expect(parseRole("MASTER")).toBe("MASTER");
    expect(parseRole("ADMIN")).toBe("ADMIN");
  });

  it("возвращает null на всём остальном, а не бросает исключение", () => {
    // В базе role — String с CHECK-констрейнтом, а не enum. Значение
    // приходит из БД строкой, и код обязан пережить любую: упавшая
    // страница на неизвестной роли — это отказ в обслуживании всем,
    // кому не повезло, вместо честного «доступа нет».
    expect(parseRole("SUPERADMIN")).toBeNull();
    expect(parseRole("client")).toBeNull();
    expect(parseRole(null)).toBeNull();
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole(42)).toBeNull();
  });
});

describe("isAllowed", () => {
  it("пропускает только перечисленные роли", () => {
    expect(isAllowed("ADMIN", ["ADMIN"])).toBe(true);
    expect(isAllowed("MASTER", ["MASTER", "ADMIN"])).toBe(true);
    expect(isAllowed("CLIENT", ["MASTER", "ADMIN"])).toBe(false);
  });

  it("не пускает никого без роли", () => {
    expect(isAllowed(null, ["CLIENT"])).toBe(false);
  });

  it("не даёт админу неявного доступа к кабинету мастера", () => {
    // Иерархии ролей в проекте нет намеренно: у мастера свои записи
    // и своя выручка, админ туда попадает не «по старшинству»,
    // а только если это выписано явно.
    expect(isAllowed("ADMIN", ["MASTER"])).toBe(false);
  });
});
