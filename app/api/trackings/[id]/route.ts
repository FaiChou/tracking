import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取单个运单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tracking = await prisma.tracking.findUnique({
      where: { id: params.id },
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
    });
    
    if (!tracking) {
      return NextResponse.json(
        { message: "运单不存在" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(tracking);
  } catch (error) {
    console.error("Failed to fetch tracking:", error);
    return NextResponse.json(
      { message: "获取运单失败" },
      { status: 500 }
    );
  }
}

// 更新运单
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status, logisticsCompanyId, forwarderId, note } = body;
    
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
    
    // 更新运单
    const updatedTracking = await prisma.tracking.update({
      where: { id: params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(logisticsCompanyId !== undefined && { logisticsCompanyId }),
        ...(forwarderId !== undefined && { forwarderId }),
        ...(note !== undefined && { note }),
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
    });
    
    return NextResponse.json(updatedTracking);
  } catch (error) {
    console.error("Failed to update tracking:", error);
    return NextResponse.json(
      { message: "更新运单失败" },
      { status: 500 }
    );
  }
}

// 删除运单
export async function DELETE(
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
    
    // 删除运单
    await prisma.tracking.delete({
      where: { id: params.id },
    });
    
    return NextResponse.json({ message: "运单已删除" });
  } catch (error) {
    console.error("Failed to delete tracking:", error);
    return NextResponse.json(
      { message: "删除运单失败" },
      { status: 500 }
    );
  }
} 