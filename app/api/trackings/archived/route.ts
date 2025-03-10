import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取归档运单列表
export async function GET(request: NextRequest) {
  try {
    const archivedTrackings = await prisma.tracking.findMany({
      where: {
        isArchived: true,
      },
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
        updatedAt: "desc",
      },
    });
    
    return NextResponse.json(archivedTrackings);
  } catch (error) {
    console.error("Failed to fetch archived trackings:", error);
    return NextResponse.json(
      { message: "获取归档运单失败" },
      { status: 500 }
    );
  }
} 