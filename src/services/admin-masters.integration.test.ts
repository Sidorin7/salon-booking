import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createMaster, listMasters, updateMaster } from "./admin-masters";
import { makeService } from "../../tests/db/fixtures";

/*
  Админка мастеров: createMaster заводит и пользователя (auth.api.createUser
  — без автовхода, без куки), и профиль. Проверка «куки не тронуты» здесь
  не нужна: сервис вызывается напрямую, без HTTP-контекста, где кука
  вообще могла бы уехать. Риск был именно в Server Action — там он снят
  выбором auth.api.createUser вместо signUpEmail.
*/

let counter = 0;
const uniqEmail = () => `master-${Date.now()}-${counter++}@salon.test`;

describe("createMaster", () => {
  it("создаёт пользователя с ролью MASTER, профиль и привязку услуг", async () => {
    const service = await makeService(60);
    const email = uniqEmail();

    const result = await createMaster({
      name: "Новый Мастер",
      email,
      password: "password123",
      displayName: "Новый",
      bio: "Пробный профиль",
      serviceIds: [service.id],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe("MASTER");

    const master = await prisma.master.findUniqueOrThrow({
      where: { id: result.masterId },
      include: { services: true },
    });
    expect(master.userId).toBe(user.id);
    expect(master.displayName).toBe("Новый");
    expect(master.services.map((s) => s.serviceId)).toEqual([service.id]);

    // Пароль действительно рабочий: auth.api.createUser должен был
    // связать хеш с учёткой так же, как обычная регистрация.
    const signIn = await auth.api.signInEmail({
      body: { email, password: "password123" },
    });
    expect(signIn.user.email).toBe(email);
  });

  it("отвечает EMAIL_TAKEN на занятой почте", async () => {
    const service = await makeService(60);
    const email = uniqEmail();

    await createMaster({
      name: "Первый",
      email,
      password: "password123",
      displayName: "Первый",
      bio: null,
      serviceIds: [service.id],
    });

    const result = await createMaster({
      name: "Второй",
      email,
      password: "password123",
      displayName: "Второй",
      bio: null,
      serviceIds: [service.id],
    });

    expect(result).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
  });
});

describe("listMasters", () => {
  it("показывает мастера с email и услугами", async () => {
    const service = await makeService(45);
    const email = uniqEmail();
    const created = await createMaster({
      name: "Мастер Списка",
      email,
      password: "password123",
      displayName: "Списочный",
      bio: null,
      serviceIds: [service.id],
    });
    if (!created.ok) throw new Error("setup failed");

    const masters = await listMasters();
    const row = masters.find((m) => m.id === created.masterId);

    expect(row).toBeDefined();
    expect(row?.email).toBe(email);
    expect(row?.serviceTitles).toContain(`Услуга ${service.durationMin} мин`);
  });
});

describe("updateMaster", () => {
  it("обновляет профиль и пересобирает набор услуг", async () => {
    const serviceA = await makeService(30);
    const serviceB = await makeService(60);
    const created = await createMaster({
      name: "До правки",
      email: uniqEmail(),
      password: "password123",
      displayName: "До правки",
      bio: "Старое",
      serviceIds: [serviceA.id],
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await updateMaster(created.masterId, {
      displayName: "После правки",
      bio: "Новое",
      serviceIds: [serviceB.id],
      isActive: false,
    });

    expect(result.ok).toBe(true);

    const master = await prisma.master.findUniqueOrThrow({
      where: { id: created.masterId },
      include: { services: true },
    });
    expect(master.displayName).toBe("После правки");
    expect(master.bio).toBe("Новое");
    expect(master.isActive).toBe(false);
    expect(master.services.map((s) => s.serviceId)).toEqual([serviceB.id]);
  });

  it("отвечает NOT_FOUND на несуществующем мастере", async () => {
    const result = await updateMaster("no-such-id", {
      displayName: "Х",
      bio: null,
      serviceIds: [],
      isActive: true,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
