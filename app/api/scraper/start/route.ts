import { NextResponse } from "next/server";
import { startManualTrackingSync } from "@/lib/tracking-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await startManualTrackingSync();
    if (!result.started) {
      return NextResponse.json({
        message: result.reason || "已有抓取任务正在运行，请等待完成或先停止任务",
        run: result.run,
      }, { status: 409 });
    }
    return NextResponse.json({ run: result.run }, { status: 202 });
  } catch (error) {
    console.error("Failed to start scraper:", error);
    return NextResponse.json({ message: "启动抓取失败" }, { status: 500 });
  }
}
