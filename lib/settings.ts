import prisma from "@/lib/prisma";
import { DEFAULT_SCRAPER_URL } from "@/lib/scraper-url";
import { normalizeDailySyncTimes } from "@/lib/tracking-schedule";

export async function getSettings() {
  const settings = await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", scraperUrl: DEFAULT_SCRAPER_URL },
    update: {},
    select: { scraperUrl: true, dailySyncTime: true },
  });
  const dailySyncTimes = normalizeDailySyncTimes(settings.dailySyncTime);
  return {
    scraperUrl: settings.scraperUrl,
    dailySyncTime: dailySyncTimes.join(","),
    dailySyncTimes,
  };
}
