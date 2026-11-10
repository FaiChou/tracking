import { NextRequest, NextResponse } from "next/server";
import { RetryTrackingError, startRetryTrackingSync } from "@/lib/tracking-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let runId: string;
  let trackingId: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.runId !== "string" || !body.runId.trim()) {
      return NextResponse.json({ message: "请指定失败项所属的抓取任务" }, { status: 400 });
    }
    runId = body.runId.trim();
    if (body.trackingId !== undefined) {
      if (typeof body.trackingId !== "string" || !body.trackingId.trim()) {
        return NextResponse.json({ message: "重试运单 ID 不正确" }, { status: 400 });
      }
      trackingId = body.trackingId.trim();
    }
  } catch {
    return NextResponse.json({ message: "请求格式不正确" }, { status: 400 });
  }

  try {
    const result = await startRetryTrackingSync(runId, trackingId);
    if (!result.started) {
      return NextResponse.json({
        message: result.reason || "已有抓取任务正在运行，请完成或停止后再重试",
        run: result.run,
      }, { status: 409 });
    }
    return NextResponse.json({ run: result.run }, { status: 202 });
  } catch (error) {
    if (error instanceof RetryTrackingError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("Failed to retry scraper items:", error);
    return NextResponse.json({ message: "启动失败项重试失败" }, { status: 500 });
  }
}
