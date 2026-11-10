import prisma from "@/lib/prisma";
import { DEFAULT_SCRAPER_URL } from "@/lib/scraper-url";

export async function getSettings() {
  return prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", scraperUrl: DEFAULT_SCRAPER_URL },
    update: {},
    select: { scraperUrl: true, dailySyncTime: true },
  });
}
