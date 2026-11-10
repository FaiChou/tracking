import type { Prisma, TrackingStatus, TrackingStatusChangeSource } from "@prisma/client";

export const STATUS_CHANGE_LOG_LIMIT = 500;

type StatusChange = {
  trackingId: string;
  trackingNumber: string;
  fromStatus: TrackingStatus;
  toStatus: TrackingStatus;
  source: TrackingStatusChangeSource;
  syncRunId?: string | null;
  createdAt?: Date;
};

/** Call inside the same transaction as the status update, so both the log and its cap are atomic. */
export async function recordTrackingStatusChange(tx: Prisma.TransactionClient, data: StatusChange) {
  if (data.fromStatus === data.toStatus) return null;
  const entry = await tx.trackingStatusLog.create({ data });
  // IDs establish insertion order even when several entries share one timestamp.
  const oldestToKeep = await tx.trackingStatusLog.findFirst({
    orderBy: { id: "desc" }, skip: STATUS_CHANGE_LOG_LIMIT - 1, select: { id: true },
  });
  if (oldestToKeep) {
    await tx.trackingStatusLog.deleteMany({ where: { id: { lt: oldestToKeep.id } } });
  }
  return entry;
}
