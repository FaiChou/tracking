import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 归档运单
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 检查运单是否存在
    const tracking = await prisma.tracking.findUnique({
      where: { id: params.id },
    });
    
    if (!tracking) {
      return NextResponse.json(
        { message: "运单不存在" },
        { status: 404 }
      );
    }
    
    // 归档运单
    const archivedTracking = await prisma.tracking.update({
      where: { id: params.id },
      data: { isArchived: true },
    });
    
    return NextResponse.json(archivedTracking);
  } catch (error) {
    console.error("Failed to archive tracking:", error);
    return NextResponse.json(
      { message: "归档运单失败" },
      { status: 500 }
    );
  }
} 