import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取单个物流公司
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const logisticsCompany = await prisma.logisticsCompany.findUnique({
      where: { id: (await params).id },
    });
    
    if (!logisticsCompany) {
      return NextResponse.json(
        { message: "物流公司不存在" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(logisticsCompany);
  } catch (error) {
    console.error("Failed to fetch logistics company:", error);
    return NextResponse.json(
      { message: "获取物流公司失败" },
      { status: 500 }
    );
  }
}

// 更新物流公司
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { name, color, trackingUrl } = body;
    
    // 检查物流公司是否存在
    const logisticsCompany = await prisma.logisticsCompany.findUnique({
      where: { id: (await params).id },
    });
    
    if (!logisticsCompany) {
      return NextResponse.json(
        { message: "物流公司不存在" },
        { status: 404 }
      );
    }
    
    // 如果更改了名称，检查新名称是否已存在
    if (name && name !== logisticsCompany.name) {
      const existingCompany = await prisma.logisticsCompany.findUnique({
        where: { name },
      });
      
      if (existingCompany) {
        return NextResponse.json(
          { message: "物流公司名称已存在" },
          { status: 400 }
        );
      }
    }
    
    // 更新物流公司
    const updatedLogisticsCompany = await prisma.logisticsCompany.update({
      where: { id: (await params).id },
      data: {
        ...(name && { name }),
        ...(color && { color }),
        ...(trackingUrl && { trackingUrl }),
      },
    });
    
    return NextResponse.json(updatedLogisticsCompany);
  } catch (error) {
    console.error("Failed to update logistics company:", error);
    return NextResponse.json(
      { message: "更新物流公司失败" },
      { status: 500 }
    );
  }
}

// 删除物流公司
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 检查物流公司是否存在
    const logisticsCompany = await prisma.logisticsCompany.findUnique({
      where: { id: (await params).id },
    });
    
    if (!logisticsCompany) {
      return NextResponse.json(
        { message: "物流公司不存在" },
        { status: 404 }
      );
    }
    
    // 检查是否有关联的运单
    const trackingsCount = await prisma.tracking.count({
      where: { logisticsCompanyId: (await params).id },
    });
    
    if (trackingsCount > 0) {
      // 更新关联的运单，将物流公司设为 null
      await prisma.tracking.updateMany({
        where: { logisticsCompanyId: (await params).id },
        data: { logisticsCompanyId: null },
      });
    }
    
    // 删除物流公司
    await prisma.logisticsCompany.delete({
      where: { id: (await params).id },
    });
    
    return NextResponse.json({ message: "物流公司已删除" });
  } catch (error) {
    console.error("Failed to delete logistics company:", error);
    return NextResponse.json(
      { message: "删除物流公司失败" },
      { status: 500 }
    );
  }
} 