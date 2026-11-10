import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { InvalidTrackingPatchError, updateTracking } from "@/lib/update-tracking";

// 获取单个运单
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tracking = await prisma.tracking.findUnique({
      where: { id: (await params).id },
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const updatedTracking = await updateTracking((await params).id, body);

    if (!updatedTracking) {
      return NextResponse.json(
        { message: "运单不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedTracking);
  } catch (error) {
    if (error instanceof InvalidTrackingPatchError || error instanceof SyntaxError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
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

    // 删除运单
    await prisma.tracking.delete({
      where: { id: (await params).id },
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
