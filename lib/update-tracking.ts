import { PrismaClient, TrackingStatus, TrackingStatusChangeSource } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recordTrackingStatusChange } from "@/lib/tracking-status-log";

type TrackingPatch = {
  status?: TrackingStatus;
  logisticsCompanyId?: string | null;
  forwarderId?: string | null;
  note?: string | null;
  isUrgent?: boolean;
};

export class InvalidTrackingPatchError extends Error {}

function parseTrackingPatch(value: unknown): TrackingPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidTrackingPatchError("运单更新内容必须是对象");
  }
  const body = value as Record<string, unknown>;
  const patch: TrackingPatch = {};
  if (body.status !== undefined) {
    if (!Object.values(TrackingStatus).includes(body.status as TrackingStatus)) {
      throw new InvalidTrackingPatchError("无效的运单状态");
    }
    patch.status = body.status as TrackingStatus;
  }
  for (const field of ["logisticsCompanyId", "forwarderId", "note"] as const) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== "string") {
        throw new InvalidTrackingPatchError(`无效的 ${field}`);
      }
      patch[field] = body[field] as string | null;
    }
  }
  if (body.isUrgent !== undefined) {
    if (typeof body.isUrgent !== "boolean") throw new InvalidTrackingPatchError("无效的加急标记");
    patch.isUrgent = body.isUrgent;
  }
  return patch;
}

export async function updateTracking(id: string, body: unknown, db: PrismaClient = prisma) {
  const data = parseTrackingPatch(body);
  return db.$transaction(async tx => {
    const previous = await tx.tracking.findUnique({ where: { id } });
    if (!previous) return null;
    const updated = await tx.tracking.update({
      where: { id }, data,
      include: {
        logisticsCompany: { select: { id: true, name: true, color: true, trackingUrl: true } },
        forwarder: { select: { id: true, name: true, color: true } },
      },
    });
    await recordTrackingStatusChange(tx, {
      trackingId: id, trackingNumber: updated.trackingNumber,
      fromStatus: previous.status, toStatus: updated.status, source: TrackingStatusChangeSource.MANUAL_EDIT,
    });
    return updated;
  });
}
