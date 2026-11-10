import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getTrackingSyncStatus } from "@/lib/tracking-sync";
import { getDueRunDate, nextScheduledAt, schedulerEnabled, TRACKING_TIME_ZONE } from "@/lib/tracking-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getTrackingSyncStatus();
    const [settings, job] = await Promise.all([
      getSettings(),
      prisma.syncJob.findUnique({ where: { id: "daily-parcel-sync" }, select: { lastRunDate: true } }),
    ]);
    const now = new Date();
    const enabled = schedulerEnabled({
      ...process.env,
      NEXT_RUNTIME: process.env.NEXT_RUNTIME,
      NODE_ENV: process.env.NODE_ENV,
    });
    const handledDate = state.activeRun?.trigger === "scheduled"
      ? getDueRunDate(state.activeRun.startedAt, "00:00")
      : job?.lastRunDate;

    return NextResponse.json({
      ...state,
      activeRun: state.activeRun ? {
        ...state.activeRun,
        durationMs: Math.max(0, now.getTime() - state.activeRun.startedAt.getTime()),
      } : null,
      schedulerEnabled: enabled,
      timeZone: TRACKING_TIME_ZONE,
      nextScheduledAt: enabled ? nextScheduledAt(now, settings.dailySyncTime, handledDate).toISOString() : null,
      serverTime: now.toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load scraper status:", error);
    return NextResponse.json({ message: "读取抓取状态失败" }, { status: 500 });
  }
}
