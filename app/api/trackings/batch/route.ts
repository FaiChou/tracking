import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { TrackingStatus } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackingNumbers, logisticsCompanyId, forwarderId, status } = body;
    
    if (!trackingNumbers || !Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json(
        { message: "运单号不能为空" },
        { status: 400 }
      );
    }
    
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
    const newNumbers = trackingNumbers.filter(n => !existingNumbers.includes(n));
    
    if (newNumbers.length === 0) {
      return NextResponse.json(
        { message: "所有运单号已存在" },
        { status: 400 }
      );
    }
    
    // 批量创建运单
    const createdTrackings = await prisma.tracking.createMany({
      data: newNumbers.map(trackingNumber => ({
        trackingNumber,
        status: status || TrackingStatus.PENDING,
        logisticsCompanyId: logisticsCompanyId || null,
        forwarderId: forwarderId || null,
      })),
    });
    
    return NextResponse.json({
      created: createdTrackings.count,
      skipped: trackingNumbers.length - newNumbers.length,
    });
  } catch (error) {
    console.error("Failed to create trackings:", error);
    return NextResponse.json(
      { message: "创建运单失败" },
      { status: 500 }
    );
  }
} 