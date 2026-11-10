import { NextRequest, NextResponse } from "next/server";
import { requestTrackingSyncStop } from "@/lib/tracking-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let runId: string;
  try {
    const body = await request.json();
    if (typeof body?.runId !== "string" || !body.runId.trim()) {
      return NextResponse.json({ message: "请指定要停止的抓取任务" }, { status: 400 });
    }
    runId = body.runId;
  } catch {
    return NextResponse.json({ message: "请求格式不正确" }, { status: 400 });
  }
  try {
    const run = await requestTrackingSyncStop(runId);
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    console.error("Failed to stop scraper:", error);
    return NextResponse.json({ message: "停止抓取失败" }, { status: 500 });
  }
}
