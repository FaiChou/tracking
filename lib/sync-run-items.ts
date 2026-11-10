import type { Prisma, PrismaClient, SyncRunItemOutcome, TrackingStatus } from "@prisma/client";
import prisma from "@/lib/prisma";

type RunItemsOptions = { db?: PrismaClient | Prisma.TransactionClient; now?: () => Date };
type RetryTracking = { isArchived: boolean; status: TrackingStatus; lastSyncError: string | null };

export class RetryTrackingError extends Error {
  constructor(public readonly statusCode: 400 | 404, message: string) {
    super(message);
    this.name = "RetryTrackingError";
  }
}

export function retryUnavailableReason(tracking: RetryTracking | null | undefined): string | null {
  if (!tracking) return "运单已删除";
  if (tracking.isArchived) return "运单已归档";
  if (tracking.status === "DELIVERED") return "运单已签收";
  if (tracking.status === "EXCEPTION") return "运单处于异常状态";
  if (!tracking.lastSyncError?.trim()) return "该运单之后已查询成功，无需重试";
  return null;
}

export type SyncRunItemDetail = {
  id: number | null;
  trackingId: string;
  trackingNumber: string;
  outcome: SyncRunItemOutcome;
  reason: string | null;
  createdAt: Date;
  canRetry: boolean;
  retryUnavailableReason: string | null;
};

export type SyncRunItemsResult = {
  runId: string;
  outcome: "FAILED" | "SKIPPED";
  recorded: boolean;
  legacyFallback: boolean;
  expectedCount: number;
  retryableCount: number;
  items: SyncRunItemDetail[];
};

/** Both display and retry selection use this function, including the conservative legacy fallback. */
export async function getSyncRunItems(
  runId: string,
  outcome: "FAILED" | "SKIPPED",
  options: RunItemsOptions = {},
): Promise<SyncRunItemsResult | null> {
  const db = options.db ?? prisma;
  const run = await db.syncRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  const result: SyncRunItemsResult = {
    runId, outcome, recorded: run.hasDetails, legacyFallback: !run.hasDetails && outcome === "FAILED",
    expectedCount: outcome === "FAILED" ? run.failed : run.skipped, retryableCount: 0, items: [],
  };
  if (!run.hasDetails) {
    if (outcome === "SKIPPED" || run.failed === 0) return result;
    // A retry moves lastSyncAttemptAt outside the legacy run's window. Its persisted item
    // proves membership in this root source, so a failed retry can still be retried again.
    const provenRetries = await db.syncRunItem.findMany({
      where: { run: { retryOfRunId: run.id } },
      select: { trackingId: true }, distinct: ["trackingId"],
    });
    const remaining = await db.tracking.findMany({
      where: {
        OR: [
          { lastSyncAttemptAt: { gte: run.startedAt, lte: run.finishedAt ?? (options.now ?? (() => new Date()))() } },
          ...(provenRetries.length ? [{ id: { in: provenRetries.map(item => item.trackingId) } }] : []),
        ],
        lastSyncError: { not: null },
      },
      orderBy: [{ lastSyncAttemptAt: "asc" }, { id: "asc" }],
    });
    result.items = remaining.filter(tracking => tracking.lastSyncError?.trim()).map(tracking => {
      const unavailable = retryUnavailableReason(tracking);
      return {
        id: null, trackingId: tracking.id, trackingNumber: tracking.trackingNumber, outcome: "FAILED",
        reason: tracking.lastSyncError, createdAt: tracking.lastSyncAttemptAt ?? run.finishedAt ?? run.startedAt,
        canRetry: !unavailable, retryUnavailableReason: unavailable,
      };
    });
  } else {
    const items = await db.syncRunItem.findMany({ where: { runId, outcome }, orderBy: { id: "asc" } });
    const trackings = outcome === "FAILED" ? await db.tracking.findMany({
      where: { id: { in: items.map(item => item.trackingId) } },
      select: { id: true, isArchived: true, status: true, lastSyncError: true },
    }) : [];
    const byId = new Map(trackings.map(tracking => [tracking.id, tracking]));
    result.items = items.map(item => {
      const unavailable = outcome === "FAILED" ? retryUnavailableReason(byId.get(item.trackingId)) : null;
      return {
        id: item.id, trackingId: item.trackingId, trackingNumber: item.trackingNumber,
        outcome: item.outcome, reason: item.reason, createdAt: item.createdAt,
        canRetry: outcome === "FAILED" && !unavailable, retryUnavailableReason: unavailable,
      };
    });
  }
  result.retryableCount = result.items.filter(item => item.canRetry).length;
  return result;
}

export async function selectRetryCandidates(
  sourceRunId: string,
  trackingId: string | undefined,
  options: RunItemsOptions,
) {
  const details = await getSyncRunItems(sourceRunId, "FAILED", options);
  if (!details) throw new RetryTrackingError(404, "来源抓取任务不存在");
  if (trackingId !== undefined) {
    const item = details.items.find(candidate => candidate.trackingId === trackingId);
    if (!item) throw new RetryTrackingError(400, "该运单不属于此任务的失败项目");
    if (!item.canRetry) throw new RetryTrackingError(400, item.retryUnavailableReason ?? "该运单无法重试");
    return [{ id: item.trackingId, trackingNumber: item.trackingNumber }];
  }
  const candidates = details.items.filter(item => item.canRetry)
    .map(item => ({ id: item.trackingId, trackingNumber: item.trackingNumber }));
  if (!candidates.length) throw new RetryTrackingError(400, "此任务没有可重试的失败运单");
  return candidates;
}
