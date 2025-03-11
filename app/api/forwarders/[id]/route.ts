import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// 获取单个货代商
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const forwarder = await prisma.forwarder.findUnique({
      where: { id: (await params).id },
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { name, color, address } = body;
    
    // 检查货代商是否存在
    const forwarder = await prisma.forwarder.findUnique({
      where: { id: (await params).id },
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
    
    // 创建更新数据对象
    const data = {} as Record<string, string | null>;
    
    if (name) data.name = name;
    if (color) data.color = color;
    
    // 地址可以是空字符串或 null，所以需要特殊处理
    if (address !== undefined) {
      data.address = address;
    }
    
    // 更新货代商
    const updatedForwarder = await prisma.forwarder.update({
      where: { id: (await params).id },
      data: data as unknown as Prisma.ForwarderUpdateInput,
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 检查货代商是否存在
    const forwarder = await prisma.forwarder.findUnique({
      where: { id: (await params).id },
    });
    
    if (!forwarder) {
      return NextResponse.json(
        { message: "货代商不存在" },
        { status: 404 }
      );
    }
    
    // 检查是否有关联的运单
    const trackingsCount = await prisma.tracking.count({
      where: { forwarderId: (await params).id },
    });
    
    if (trackingsCount > 0) {
      // 更新关联的运单，将货代商设为 null
      await prisma.tracking.updateMany({
        where: { forwarderId: (await params).id },
        data: { forwarderId: null },
      });
    }
    
    // 删除货代商
    await prisma.forwarder.delete({
      where: { id: (await params).id },
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