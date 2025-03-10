import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取物流公司列表
export async function GET() {
  try {
    const logisticsCompanies = await prisma.logisticsCompany.findMany({
      orderBy: {
        name: "asc",
      },
    });
    
    return NextResponse.json(logisticsCompanies);
  } catch (error) {
    console.error("Failed to fetch logistics companies:", error);
    return NextResponse.json(
      { message: "获取物流公司列表失败" },
      { status: 500 }
    );
  }
}

// 创建物流公司
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, trackingUrl } = body;
    
    if (!name) {
      return NextResponse.json(
        { message: "物流公司名称不能为空" },
        { status: 400 }
      );
    }
    
    // 检查名称是否已存在
    const existingCompany = await prisma.logisticsCompany.findUnique({
      where: { name },
    });
    
    if (existingCompany) {
      return NextResponse.json(
        { message: "物流公司名称已存在" },
        { status: 400 }
      );
    }
    
    const logisticsCompany = await prisma.logisticsCompany.create({
      data: {
        name,
        color: color || "#000000",
        trackingUrl: trackingUrl || "",
      },
    });
    
    return NextResponse.json(logisticsCompany);
  } catch (error) {
    console.error("Failed to create logistics company:", error);
    return NextResponse.json(
      { message: "创建物流公司失败" },
      { status: 500 }
    );
  }
} 