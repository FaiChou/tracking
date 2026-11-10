import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { normalizeScraperUrl } from "@/lib/scraper-url";
import { normalizeDailySyncTime } from "@/lib/tracking-schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getSettings(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load scraper settings:", error);
    return NextResponse.json({ message: "读取设置失败" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let scraperUrl: string;
  let dailySyncTime: string | undefined;
  try {
    const body = await request.json();
    scraperUrl = normalizeScraperUrl(body?.scraperUrl);
    if (body?.dailySyncTime !== undefined) {
      dailySyncTime = normalizeDailySyncTime(body.dailySyncTime);
    }
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof SyntaxError ? "请求格式不正确" : error instanceof Error ? error.message : "地址格式不正确" },
      { status: 400 },
    );
  }

  try {
    const settings = await prisma.appSettings.upsert({
      where: { id: "default" },
      create: { id: "default", scraperUrl, dailySyncTime },
      update: { scraperUrl, ...(dailySyncTime !== undefined && { dailySyncTime }) },
      select: { scraperUrl: true, dailySyncTime: true },
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Failed to save scraper settings:", error);
    return NextResponse.json({ message: "保存设置失败" }, { status: 500 });
  }
}
