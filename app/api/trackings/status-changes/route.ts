import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { listTrackingStatusChanges, parseStatusChangeLimit } from "@/lib/tracking-status-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limit = parseStatusChangeLimit(request.nextUrl.searchParams.get("limit"));
  if (limit === null) {
    return NextResponse.json({ message: "limit 参数必须是正整数" }, { status: 400 });
  }

  try {
    const result = await listTrackingStatusChanges(prisma, limit);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load tracking status changes:", error);
    return NextResponse.json({ message: "读取状态变更记录失败" }, { status: 500 });
  }
}
