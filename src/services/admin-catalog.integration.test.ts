import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createService,
  listAllServices,
  updateService,
} from "./admin-catalog";
import { makeService } from "../../tests/db/fixtures";

/*
  Админка услуг: список видит и отключённые услуги (в отличие от
  getActiveServices), создание и правка — прямые операции без гонок,
  поэтому тесты обычные, без повторов и conflict-сценариев.
*/

describe("listAllServices", () => {
  it("возвращает и активные, и отключённые услуги", async () => {
    const active = await makeService(60);
    const disabled = await makeService(90);
    await prisma.service.update({
      where: { id: disabled.id },
      data: { isActive: false },
    });

    const services = await listAllServices();
    const ids = services.map((service) => service.id);

    expect(ids).toContain(active.id);
    expect(ids).toContain(disabled.id);
  });
});

describe("createService", () => {
  it("создаёт услугу с переданными полями", async () => {
    const result = await createService({
      title: "Стрижка",
      description: "Мужская стрижка машинкой и ножницами",
      durationMin: 45,
      priceKopecks: 150_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const created = await prisma.service.findUniqueOrThrow({
      where: { id: result.serviceId },
    });
    expect(created.title).toBe("Стрижка");
    expect(created.durationMin).toBe(45);
    expect(created.priceKopecks).toBe(150_000);
    expect(created.isActive).toBe(true);
  });

  it("создаёт услугу без описания", async () => {
    const result = await createService({
      title: "Маникюр",
      description: null,
      durationMin: 60,
      priceKopecks: 200_000,
    });

    expect(result.ok).toBe(true);
  });
});

describe("updateService", () => {
  it("обновляет все поля разом", async () => {
    const service = await makeService(60);

    const result = await updateService(service.id, {
      title: "Новое название",
      description: "Новое описание",
      durationMin: 90,
      priceKopecks: 300_000,
      isActive: false,
    });

    expect(result.ok).toBe(true);

    const updated = await prisma.service.findUniqueOrThrow({
      where: { id: service.id },
    });
    expect(updated.title).toBe("Новое название");
    expect(updated.description).toBe("Новое описание");
    expect(updated.durationMin).toBe(90);
    expect(updated.priceKopecks).toBe(300_000);
    expect(updated.isActive).toBe(false);
  });

  it("очищает описание, а не пропускает поле", async () => {
    const service = await makeService(60);
    await prisma.service.update({
      where: { id: service.id },
      data: { description: "Было" },
    });

    await updateService(service.id, {
      title: service.title,
      description: null,
      durationMin: 60,
      priceKopecks: service.priceKopecks,
      isActive: true,
    });

    const updated = await prisma.service.findUniqueOrThrow({
      where: { id: service.id },
    });
    expect(updated.description).toBeNull();
  });

  it("отвечает NOT_FOUND на несуществующей услуге", async () => {
    const result = await updateService("no-such-id", {
      title: "Х",
      description: null,
      durationMin: 30,
      priceKopecks: 100_000,
      isActive: true,
    });

    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
