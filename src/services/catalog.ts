import { prisma } from "@/lib/prisma";
import { formatKopecks } from "@/domain/pricing/money";

/** Прайс салона для выбора услуги. */
export async function getActiveServices() {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ durationMin: "asc" }, { title: "asc" }],
    select: { id: true, title: true, durationMin: true, priceKopecks: true },
  });

  return services.map((service) => ({
    ...service,
    priceLabel: formatKopecks(service.priceKopecks),
  }));
}
