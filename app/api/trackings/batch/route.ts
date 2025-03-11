import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { TrackingStatus } from "@prisma/client";

// 定义运单数据类型
interface TrackingWithNote {
  trackingNumber: string;
  note: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackingsWithNotes, logisticsCompanyId, forwarderId, status } = body;
    
    // 兼容旧版API，支持trackingNumbers参数
    let trackingsData: TrackingWithNote[] = [];
    if (trackingsWithNotes && Array.isArray(trackingsWithNotes)) {
      trackingsData = trackingsWithNotes;
    } else if (body.trackingNumbers && Array.isArray(body.trackingNumbers)) {
      trackingsData = body.trackingNumbers.map((number: string) => ({ 
        trackingNumber: number, 
        note: null 
      }));
    } else {
      return NextResponse.json(
        { message: "运单号不能为空" },
        { status: 400 }
      );
    }
    
    if (trackingsData.length === 0) {
      return NextResponse.json(
        { message: "运单号不能为空" },
        { status: 400 }
      );
    }
    
    // 提取所有运单号
    const trackingNumbers = trackingsData.map((t: TrackingWithNote) => t.trackingNumber);
    
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
    
    const existingNumbers = existingTrackings.map(t => t.trackingNumber);
    const newTrackings = trackingsData.filter((t: TrackingWithNote) => !existingNumbers.includes(t.trackingNumber));
    
    if (newTrackings.length === 0) {
      return NextResponse.json(
        { message: "所有运单号已存在" },
        { status: 400 }
      );
    }
    
    // 批量创建运单
    const createdTrackings = await prisma.tracking.createMany({
      data: newTrackings.map((tracking: TrackingWithNote) => ({
        trackingNumber: tracking.trackingNumber,
        note: tracking.note,
        status: status || TrackingStatus.PENDING,
        logisticsCompanyId: logisticsCompanyId || null,
        forwarderId: forwarderId || null,
      })),
    });
    
    return NextResponse.json({
      created: createdTrackings.count,
      skipped: trackingNumbers.length - newTrackings.length,
    });
  } catch (error) {
    console.error("Failed to create trackings:", error);
    return NextResponse.json(
      { message: "创建运单失败" },
      { status: 500 }
    );
  }
} 