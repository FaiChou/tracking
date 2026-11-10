import { NextRequest, NextResponse } from "next/server";
import { getSyncRunItems } from "@/lib/sync-run-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const outcome = request.nextUrl.searchParams.get("outcome") ?? "FAILED";
  if (outcome !== "FAILED" && outcome !== "SKIPPED") {
    return NextResponse.json({ message: "请选择失败或跳过的抓取明细" }, { status: 400 });
  }
  try {
    const details = await getSyncRunItems((await params).id, outcome);
    if (!details) return NextResponse.json({ message: "抓取任务不存在" }, { status: 404 });
    return NextResponse.json(details, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load scraper run items:", error);
    return NextResponse.json({ message: "读取抓取明细失败" }, { status: 500 });
  }
}
