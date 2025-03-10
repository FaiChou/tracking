import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// 获取单个货代商
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const forwarder = await prisma.forwarder.findUnique({
      where: { id: params.id },
    });
    
    if (!forwarder) {
      return NextResponse.json(
        { message: "货代商不存在" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(forwarder);
  } catch (error) {
    console.error("Failed to fetch forwarder:", error);
    return NextResponse.json(
      { message: "获取货代商失败" },
      { status: 500 }
    );
  }
}

// 更新货代商
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, color } = body;
    
    // 检查货代商是否存在
    const forwarder = await prisma.forwarder.findUnique({
      where: { id: params.id },
    });
    
    if (!forwarder) {
      return NextResponse.json(
        { message: "货代商不存在" },
        { status: 404 }
      );
    }
    
    // 如果更改了名称，检查新名称是否已存在
    if (name && name !== forwarder.name) {
      const existingForwarder = await prisma.forwarder.findUnique({
        where: { name },
      });
      
      if (existingForwarder) {
        return NextResponse.json(
          { message: "货代商名称已存在" },
          { status: 400 }
        );
      }
    }
    
    // 更新货代商
    const updatedForwarder = await prisma.forwarder.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(color && { color }),
      },
    });
    
    return NextResponse.json(updatedForwarder);
  } catch (error) {
    console.error("Failed to update forwarder:", error);
    return NextResponse.json(
      { message: "更新货代商失败" },
      { status: 500 }
    );
  }
}

// 删除货代商
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 检查货代商是否存在
    const forwarder = await prisma.forwarder.findUnique({
      where: { id: params.id },
    });
    
    if (!forwarder) {
      return NextResponse.json(
        { message: "货代商不存在" },
        { status: 404 }
      );
    }
    
    // 检查是否有关联的运单
    const trackingsCount = await prisma.tracking.count({
      where: { forwarderId: params.id },
    });
    
    if (trackingsCount > 0) {
      // 更新关联的运单，将货代商设为 null
      await prisma.tracking.updateMany({
        where: { forwarderId: params.id },
        data: { forwarderId: null },
      });
    }
    
    // 删除货代商
    await prisma.forwarder.delete({
      where: { id: params.id },
    });
    
    return NextResponse.json({ message: "货代商已删除" });
  } catch (error) {
    console.error("Failed to delete forwarder:", error);
    return NextResponse.json(
      { message: "删除货代商失败" },
      { status: 500 }
    );
  }
} 