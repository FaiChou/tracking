import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { TrackingStatus } from "@prisma/client";
import { guessLogisticsCompanyId } from "@/lib/guess-logistics-company";
import { normalizeTrackingNumber } from "@/lib/tracking-number";

// 定义运单数据类型
interface TrackingWithNote {
  trackingNumber: string;
  note: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackingsWithNotes, trackingNumbers: inputNumbers, logisticsCompanyId, forwarderId, status } = body ?? {};
    
    // 兼容旧版API，支持trackingNumbers参数
    let inputTrackings: unknown[];
    if (trackingsWithNotes && Array.isArray(trackingsWithNotes)) {
      inputTrackings = trackingsWithNotes;
    } else if (Array.isArray(inputNumbers)) {
      inputTrackings = inputNumbers.map((number: unknown) => ({
        trackingNumber: number, 
        note: null 
      }));
    } else {
      return NextResponse.json(
        { message: "运单号不能为空" },
        { status: 400 }
      );
    }
    
    if (inputTrackings.length === 0) {
      return NextResponse.json(
        { message: "运单号不能为空" },
        { status: 400 }
      );
    }
    
    // 全部校验通过后再创建，避免无效单号导致部分成功。
    const uniqueTrackings = new Map<string, TrackingWithNote>();
    for (const input of inputTrackings) {
      if (!input || typeof input !== "object" || !("trackingNumber" in input)
        || typeof input.trackingNumber !== "string") {
        return NextResponse.json({ message: "运单号必须是字符串" }, { status: 400 });
      }
      const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
      if (!trackingNumber) {
        return NextResponse.json({ message: "运单号不能为空" }, { status: 400 });
      }
      // 清理后可能出现同批重复，保留第一条的备注。
      if (!uniqueTrackings.has(trackingNumber)) {
        uniqueTrackings.set(trackingNumber, {
          trackingNumber,
          note: (input as TrackingWithNote).note,
        });
      }
    }
    const trackingsData = [...uniqueTrackings.values()];
    const trackingNumbers = [...uniqueTrackings.keys()];
    
    // 检查运单号是否已存在
    const existingTrackings = await prisma.tracking.findMany({
      where: {
        trackingNumber: {
          in: trackingNumbers,
        },
      },
      select: {
        trackingNumber: true,
      },
    });
    
    const existingNumbers = new Set(existingTrackings.map(t => t.trackingNumber));
    const newTrackings = trackingsData.filter(t => !existingNumbers.has(t.trackingNumber));
    
    if (newTrackings.length === 0) {
      return NextResponse.json(
        { message: "所有运单号已存在" },
        { status: 400 }
      );
    }
    
    const companies = logisticsCompanyId
      ? []
      : await prisma.logisticsCompany.findMany({
          select: { id: true, name: true },
        });

    // 批量创建运单，每个运单单独识别物流公司
    const createdTrackings = await prisma.tracking.createMany({
      data: newTrackings.map((tracking: TrackingWithNote) => ({
        trackingNumber: tracking.trackingNumber,
        note: tracking.note,
        status: status || TrackingStatus.PENDING,
        logisticsCompanyId: logisticsCompanyId || guessLogisticsCompanyId(tracking.trackingNumber, companies),
        forwarderId: forwarderId || null,
      })),
    });
    
    return NextResponse.json({
      created: createdTrackings.count,
      skipped: inputTrackings.length - createdTrackings.count,
    });
  } catch (error) {
    console.error("Failed to create trackings:", error);
    return NextResponse.json(
      { message: "创建运单失败" },
      { status: 500 }
    );
  }
}
