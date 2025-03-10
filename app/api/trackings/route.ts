import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { TrackingStatus } from "@prisma/client";

// 获取运单列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as TrackingStatus | null;
    const logisticsCompanyId = searchParams.get("logisticsCompanyId");
    const forwarderId = searchParams.get("forwarderId");
    
    const where = {
      isArchived: false,
      ...(status && { status }),
      ...(logisticsCompanyId && { logisticsCompanyId }),
      ...(forwarderId && { forwarderId }),
    };
    
    const trackings = await prisma.tracking.findMany({
      where,
      include: {
        logisticsCompany: {
          select: {
            id: true,
            name: true,
            color: true,
            trackingUrl: true,
          },
        },
        forwarder: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    
    return NextResponse.json(trackings);
  } catch (error) {
    console.error("Failed to fetch trackings:", error);
    return NextResponse.json(
      { message: "获取运单失败" },
      { status: 500 }
    );
  }
}

// 创建单个运单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trackingNumber, logisticsCompanyId, forwarderId, status, note } = body;
    
    if (!trackingNumber) {
      return NextResponse.json(
        { message: "运单号不能为空" },
        { status: 400 }
      );
    }
    
    // 检查运单号是否已存在
    const existingTracking = await prisma.tracking.findUnique({
      where: { trackingNumber },
    });
    
    if (existingTracking) {
      return NextResponse.json(
        { message: "运单号已存在" },
        { status: 400 }
      );
    }
    
    const tracking = await prisma.tracking.create({
      data: {
        trackingNumber,
        status: status || TrackingStatus.PENDING,
        note,
        logisticsCompanyId: logisticsCompanyId || null,
        forwarderId: forwarderId || null,
      },
    });
    
    return NextResponse.json(tracking);
  } catch (error) {
    console.error("Failed to create tracking:", error);
    return NextResponse.json(
      { message: "创建运单失败" },
      { status: 500 }
    );
  }
} 