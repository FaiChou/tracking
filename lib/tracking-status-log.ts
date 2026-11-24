import type { Prisma, PrismaClient, TrackingStatus, TrackingStatusChangeSource } from "@prisma/client";

export const STATUS_CHANGE_LOG_LIMIT = 500;
export const RECENT_STATUS_CHANGE_POPOVER_LIMIT = 200;

export function parseStatusChangeLimit(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return STATUS_CHANGE_LOG_LIMIT;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, STATUS_CHANGE_LOG_LIMIT);
}

export async function listTrackingStatusChanges(
  db: Pick<PrismaClient, "trackingStatusLog">,
  limit = STATUS_CHANGE_LOG_LIMIT,
) {
  const rows = await db.trackingStatusLog.findMany({
    orderBy: { id: "desc" },
    take: limit + 1,
  });
  return {
    logs: rows.slice(0, limit),
    limit,
    hasMore: rows.length > limit,
  };
}

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
