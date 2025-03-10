import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取未归档运单总数
export async function GET() {
  try {
    const count = await prisma.tracking.count({
      where: {
        isArchived: false,
      },
    });
    
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Failed to count trackings:", error);
    return NextResponse.json(
      { message: "获取运单数量失败", count: 0 },
      { status: 500 }
    );
  }
} 