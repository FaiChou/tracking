import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 取消归档运单
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 检查运单是否存在
    const tracking = await prisma.tracking.findUnique({
      where: { id: (await params).id },
    });
    
    if (!tracking) {
      return NextResponse.json(
        { message: "运单不存在" },
        { status: 404 }
      );
    }
    
    // 取消归档运单
    const unarchivedTracking = await prisma.tracking.update({
      where: { id: (await params).id },
      data: { isArchived: false },
    });
    
    return NextResponse.json(unarchivedTracking);
  } catch (error) {
    console.error("Failed to unarchive tracking:", error);
    return NextResponse.json(
      { message: "取消归档运单失败" },
      { status: 500 }
    );
  }
} 