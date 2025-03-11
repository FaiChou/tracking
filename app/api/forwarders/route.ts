import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// 获取货代商列表
export async function GET() {
  try {
    const forwarders = await prisma.forwarder.findMany({
      orderBy: {
        name: "asc",
      },
    });
    
    return NextResponse.json(forwarders);
  } catch (error) {
    console.error("Failed to fetch forwarders:", error);
    return NextResponse.json(
      { message: "获取货代商列表失败" },
      { status: 500 }
    );
  }
}

// 创建货代商
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, address } = body;
    
    if (!name) {
      return NextResponse.json(
        { message: "货代商名称不能为空" },
        { status: 400 }
      );
    }
    
    // 检查名称是否已存在
    const existingForwarder = await prisma.forwarder.findUnique({
      where: { name },
    });
    
    if (existingForwarder) {
      return NextResponse.json(
        { message: "货代商名称已存在" },
        { status: 400 }
      );
    }
    
    // 创建数据对象
    const data = {
      name,
      color: color || "#000000",
    } as Record<string, string | null>;
    
    // 如果有地址，添加到数据对象
    if (address !== undefined) {
      data.address = address;
    }
    
    const forwarder = await prisma.forwarder.create({
      data: data as unknown as Prisma.ForwarderCreateInput,
    });
    
    return NextResponse.json(forwarder);
  } catch (error) {
    console.error("Failed to create forwarder:", error);
    return NextResponse.json(
      { message: "创建货代商失败" },
      { status: 500 }
    );
  }
} 