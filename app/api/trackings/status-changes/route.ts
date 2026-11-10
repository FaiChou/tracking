import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { STATUS_CHANGE_LOG_LIMIT } from "@/lib/tracking-status-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const logs = await prisma.trackingStatusLog.findMany({
      orderBy: { id: "desc" },
      take: STATUS_CHANGE_LOG_LIMIT,
    });
    return NextResponse.json({ logs, limit: STATUS_CHANGE_LOG_LIMIT }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load tracking status changes:", error);
    return NextResponse.json({ message: "读取状态变更记录失败" }, { status: 500 });
  }
}
