import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { newestEventsFirst } from "@/lib/tracking-history";
import { syncSingleTracking } from "@/lib/tracking-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tracking = await prisma.tracking.findUnique({
      where: { id: (await params).id },
      select: {
        lastSyncedAt: true,
        lastSyncAttemptAt: true,
        lastSyncError: true,
        events: {
          orderBy: [{ occurredAt: "desc" }, { tieOrder: "desc" }, { id: "desc" }],
          select: {
            id: true,
            occurredAt: true,
            timeText: true,
            description: true,
            stage: true,
            location: true,
            tieOrder: true,
          },
        },
      },
    });

    if (!tracking) {
      return NextResponse.json({ message: "运单不存在" }, { status: 404 });
    }

    return NextResponse.json({ ...tracking, events: newestEventsFirst(tracking.events) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load tracking history:", error);
    return NextResponse.json({ message: "读取物流轨迹失败" }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await syncSingleTracking((await params).id);
    if (!result) {
      return NextResponse.json({ message: "运单不存在" }, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to sync tracking history:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "手动抓取物流轨迹失败" },
      { status: 502 },
    );
  }
}
