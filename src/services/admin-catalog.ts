/*
  Админка: полный список услуг и их редактирование.

  В отличие от src/services/catalog.ts (прайс для клиента, только
  активные), здесь видно всё — иначе отключённую услугу нельзя было бы
  снова включить или посмотреть, что вообще есть в салоне.

  Удаления нет: у Service стоит onDelete: Restrict со стороны записи,
  и услуга с историей не удалится. Отключение (isActive) для этого
  и есть.
*/

import { prisma } from "@/lib/prisma";
import { formatKopecks } from "@/domain/pricing/money";

export type AdminFailure = "NOT_FOUND";

export type AdminResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: AdminFailure };

export type AdminServiceRow = {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  priceKopecks: number;
  priceLabel: string;
  isActive: boolean;
};

/** Все услуги салона, включая отключённые — для списка в админке. */
export async function listAllServices(): Promise<AdminServiceRow[]> {
  const services = await prisma.service.findMany({
    orderBy: [{ isActive: "desc" }, { title: "asc" }],
  });

  return services.map((service) => ({
    id: service.id,
    title: service.title,
    description: service.description,
    durationMin: service.durationMin,
    priceKopecks: service.priceKopecks,
    priceLabel: formatKopecks(service.priceKopecks),
    isActive: service.isActive,
  }));
}

export type ServiceInput = {
  title: string;
  // null, а не undefined: Prisma пропускает undefined-поля при update,
  // и очистка описания в форме молча ничего бы не меняла.
  description: string | null;
  durationMin: number;
  priceKopecks: number;
};

export async function createService(
  input: ServiceInput,
): Promise<AdminResult<{ serviceId: string }>> {
  const created = await prisma.service.create({
    data: {
      title: input.title,
      description: input.description,
      durationMin: input.durationMin,
      priceKopecks: input.priceKopecks,
    },
    select: { id: true },
  });

  return { ok: true, serviceId: created.id };
}

export async function updateService(
  serviceId: string,
  input: ServiceInput & { isActive: boolean },
): Promise<AdminResult> {
  const { count } = await prisma.service.updateMany({
    where: { id: serviceId },
    data: {
      title: input.title,
      description: input.description,
      durationMin: input.durationMin,
      priceKopecks: input.priceKopecks,
      isActive: input.isActive,
    },
  });

  return count === 0 ? { ok: false, reason: "NOT_FOUND" } : { ok: true };
}
