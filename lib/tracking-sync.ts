import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Prisma, PrismaClient, TrackingStatus, TrackingStatusChangeSource, type SyncRun, type SyncRunItemOutcome, type Tracking } from "@prisma/client";
import prisma from "@/lib/prisma";
import { DEFAULT_SCRAPER_URL } from "@/lib/scraper-url";
import { fetchParcel, ScraperHttpError, type ScraperResult } from "@/lib/scraper";
import { DEFAULT_DAILY_SYNC_TIME, getDueRunDate, runDateStart } from "@/lib/tracking-schedule";
import { recordTrackingStatusChange } from "@/lib/tracking-status-log";
import { getSyncRunItems, retryUnavailableReason, RetryTrackingError, selectRetryCandidates } from "@/lib/sync-run-items";

export { RetryTrackingError } from "@/lib/sync-run-items";

const JOB_ID = "daily-parcel-sync";
const LEASE_MS = 5 * 60_000;
const REQUEST_INTERVAL_MS = 2_000;
const ACTIVE_STATUSES = ["RUNNING", "STOPPING"];
const eligibleStatuses: TrackingStatus[] = [TrackingStatus.PENDING, TrackingStatus.TRANSIT];

export type SyncOptions = {
  db?: PrismaClient;
  now?: () => Date;
  fetchTracking?: typeof fetchParcel;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

type Dependencies = Required<SyncOptions>;
type RunCandidate = { id: string; trackingNumber: string };
type RunContext = Dependencies & {
  run: SyncRun;
  runDate: string | null;
  startedAfter: Date | null;
  scraperUrl: string;
  lockToken: string;
  candidates: RunCandidate[];
};

export type SyncSummary = { acquired: boolean; succeeded: number; failed: number; skipped: number };

type SyncGlobal = typeof globalThis & { trackingSyncControllers?: Map<string, AbortController> };
const controllers = (globalThis as SyncGlobal).trackingSyncControllers ??= new Map<string, AbortController>();

class StopRequestedError extends Error {
  constructor() { super("抓取已停止"); this.name = "StopRequestedError"; }
}
class LeaseLostError extends Error {
  constructor() { super("抓取任务锁已失效"); this.name = "LeaseLostError"; }
}

function dependencies(options: SyncOptions): Dependencies {
  return {
    db: options.db ?? prisma,
    now: options.now ?? (() => new Date()),
    fetchTracking: options.fetchTracking ?? fetchParcel,
    wait: options.wait ?? (async (milliseconds, signal) => { await delay(milliseconds, undefined, { signal }); }),
  };
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : "抓取失败").slice(0, 500);
}

export function nextTrackingStatus(current: TrackingStatus, result: ScraperResult): TrackingStatus {
  return !result.status || (current === "TRANSIT" && result.status === "PENDING") ? current : result.status;
}

/** Reconcile persisted runs after crashes before displaying status or claiming another run. */
async function recoverInterruptedRuns(db: PrismaClient, now: () => Date) {
  const interrupted = await db.$transaction(async tx => {
    const job = await tx.syncJob.findUnique({ where: { id: JOB_ID } });
    const hasValidLease = !!(job?.lockToken && job.lockedUntil && job.lockedUntil > now());
    const validRunId = hasValidLease ? job?.activeRunId : null;
    const orphans = await tx.syncRun.findMany({
      where: { status: { in: ACTIVE_STATUSES }, ...(validRunId ? { id: { not: validRunId } } : {}) },
    });
    for (const run of orphans) {
      const finishedAt = now();
      await tx.syncRun.updateMany({
        where: { id: run.id, status: { in: ACTIVE_STATUSES } },
        data: {
          status: "INTERRUPTED", finishedAt, durationMs: Math.max(0, finishedAt.getTime() - run.startedAt.getTime()),
          currentTrackingNumber: null, error: "任务进程已中断，可重新开始抓取",
        },
      });
    }
    if (job && !hasValidLease) {
      await tx.syncJob.updateMany({
        where: { id: JOB_ID, lockToken: job.lockToken, activeRunId: job.activeRunId },
        data: { activeRunId: null, lockToken: null, lockedUntil: null },
      });
    }
    return orphans.map(run => run.id);
  });
  for (const runId of interrupted) controllers.get(runId)?.abort(new LeaseLostError());
}

export async function getTrackingSyncStatus(options: SyncOptions = {}): Promise<{
  activeRun: SyncRun | null; lastRun: SyncRun | null;
  retrySourceRun: (SyncRun & { retryableCount: number }) | null;
}> {
  const { db, now } = dependencies(options);
  await recoverInterruptedRuns(db, now);
  const [activeRun, lastRun] = await Promise.all([
    db.syncRun.findFirst({ where: { status: { in: ACTIVE_STATUSES } }, orderBy: { startedAt: "desc" } }),
    db.syncRun.findFirst({ where: { status: { notIn: ACTIVE_STATUSES } }, orderBy: [{ startedAt: "desc" }, { id: "desc" }] }),
  ]);
  const sourceRunId = (activeRun ?? lastRun)?.retryOfRunId;
  const sourceRun = sourceRunId ? await db.syncRun.findUnique({ where: { id: sourceRunId } }) : null;
  const sourceItems = sourceRun ? await getSyncRunItems(sourceRun.id, "FAILED", { db, now }) : null;
  return {
    activeRun, lastRun,
    retrySourceRun: sourceRun && sourceItems ? { ...sourceRun, retryableCount: sourceItems.retryableCount } : null,
  };
}

export async function requestTrackingSyncStop(runId: string, options: SyncOptions = {}): Promise<SyncRun | null> {
  const { db, now } = dependencies(options);
  await recoverInterruptedRuns(db, now);
  const run = await db.$transaction(async tx => {
    const current = await tx.syncRun.findUnique({ where: { id: runId } });
    if (!current || !ACTIVE_STATUSES.includes(current.status)) return current;
    const stopped = await tx.syncJob.updateMany({
      where: { id: JOB_ID, activeRunId: runId, lockedUntil: { gt: now() } },
      // Persist this immediately so a crash after Stop cannot restart today's scheduled run.
      data: current.trigger === "scheduled"
        ? { lastRunDate: getDueRunDate(current.startedAt, "00:00") }
        : { activeRunId: runId },
    });
    if (stopped.count !== 1) return current;
    return tx.syncRun.update({ where: { id: runId }, data: { stopRequested: true, status: "STOPPING" } });
  });
  if (run?.status === "STOPPING") controllers.get(runId)?.abort(new StopRequestedError());
  return run;
}

async function claimRun(trigger: "manual" | "scheduled" | "retry", options: SyncOptions,
  retry?: { sourceRunId: string; trackingId?: string }): Promise<{
  context: RunContext | null; reason?: string;
}> {
  const deps = dependencies(options);
  const { db, now } = deps;
  const settings = await db.appSettings.upsert({
    where: { id: "default" }, update: {},
    create: { id: "default", scraperUrl: DEFAULT_SCRAPER_URL, dailySyncTime: DEFAULT_DAILY_SYNC_TIME },
  });
  const runDate = trigger === "scheduled" ? getDueRunDate(now(), settings.dailySyncTime) : null;
  if (trigger === "scheduled" && !runDate) return { context: null, reason: "尚未到每日抓取时间" };
  const startedAfter = runDate ? runDateStart(runDate, settings.dailySyncTime) : null;
  await recoverInterruptedRuns(db, now);
  const lockToken = randomUUID();
  const runId = randomUUID();
  const claimed = await db.$transaction(async tx => {
    await tx.syncJob.upsert({ where: { id: JOB_ID }, create: { id: JOB_ID }, update: {} });
    const claim = await tx.syncJob.updateMany({
      where: {
        id: JOB_ID,
        AND: [
          { OR: [{ lockedUntil: null }, { lockedUntil: { lte: now() } }] },
          ...(runDate ? [{ OR: [{ lastRunDate: null }, { lastRunDate: { not: runDate } }] }] : []),
        ],
      },
      data: { lockToken, activeRunId: runId, lockedUntil: new Date(now().getTime() + LEASE_MS) },
    });
    if (claim.count !== 1) return null;
    const retrySource = retry ? await tx.syncRun.findUnique({ where: { id: retry.sourceRunId } }) : null;
    if (retry && !retrySource) throw new RetryTrackingError(404, "来源抓取任务不存在");
    const candidates = retry
      ? await selectRetryCandidates(retry.sourceRunId, retry.trackingId, { db: tx, now })
      : await tx.tracking.findMany({
        where: {
          isArchived: false, status: { in: eligibleStatuses },
          ...(startedAfter ? { OR: [{ lastSyncAttemptAt: null }, { lastSyncAttemptAt: { lt: startedAfter } }] } : {}),
        },
        select: { id: true, trackingNumber: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    const run = await tx.syncRun.create({
      data: {
        id: runId, trigger, status: "RUNNING", total: candidates.length, startedAt: now(), hasDetails: true,
        retryOfRunId: retrySource ? retrySource.retryOfRunId ?? retrySource.id : null,
      },
    });
    return { run, candidates };
  }, { timeout: 30_000 });
  return claimed ? {
    context: { ...deps, ...claimed, lockToken, scraperUrl: settings.scraperUrl, runDate, startedAfter },
  } : { context: null, reason: "已有抓取任务正在运行，或今日定时抓取已完成" };
}

function leaseWhere(context: RunContext) {
  return { id: JOB_ID, activeRunId: context.run.id, lockToken: context.lockToken, lockedUntil: { gt: context.now() } };
}

/** Taking the write fence also serializes a concurrent Stop with all parcel and counter writes. */
async function fence(tx: Prisma.TransactionClient, context: RunContext, allowStop = false) {
  const owned = await tx.syncJob.updateMany({
    where: leaseWhere(context), data: { lockedUntil: new Date(context.now().getTime() + LEASE_MS) },
  });
  if (owned.count !== 1) throw new LeaseLostError();
  const run = await tx.syncRun.findUniqueOrThrow({ where: { id: context.run.id } });
  if (!ACTIVE_STATUSES.includes(run.status)) throw new LeaseLostError();
  if (!allowStop && (run.stopRequested || run.status === "STOPPING")) throw new StopRequestedError();
  return run;
}

function skipReason(tracking: Tracking | null, context: RunContext, duringRequest = false): string | null {
  if (!tracking) return "运单已删除";
  if (tracking.isArchived) return "运单已归档";
  if (tracking.status === "DELIVERED") return "运单已签收";
  if (tracking.status === "EXCEPTION") return "运单处于异常状态";
  if (context.run.trigger === "retry") {
    const unavailable = retryUnavailableReason(tracking);
    if (unavailable) return unavailable;
  }
  if (context.startedAfter && tracking.lastSyncAttemptAt && tracking.lastSyncAttemptAt >= context.startedAfter) {
    return "当日已查询";
  }
  return duringRequest ? "查询期间运单被修改" : null;
}

async function recordProcessed(tx: Prisma.TransactionClient, context: RunContext, candidate: RunCandidate,
  outcome: SyncRunItemOutcome, reason: string | null = null) {
  await tx.syncRunItem.create({ data: {
    runId: context.run.id, trackingId: candidate.id, trackingNumber: candidate.trackingNumber,
    outcome, reason, createdAt: context.now(),
  } });
  const counter = { SUCCEEDED: "succeeded", FAILED: "failed", SKIPPED: "skipped" } as const;
  await tx.syncRun.update({ where: { id: context.run.id }, data: {
    processed: { increment: 1 }, [counter[outcome]]: { increment: 1 }, currentTrackingNumber: null,
  } });
}

async function recordSkipped(context: RunContext, candidate: RunCandidate, reason: string) {
  await context.db.$transaction(async tx => {
    await fence(tx, context);
    await recordProcessed(tx, context, candidate, "SKIPPED", reason);
  });
}

async function finishRun(context: RunContext, status: string, error?: unknown): Promise<SyncRun> {
  try {
    return await context.db.$transaction(async tx => {
      const run = await fence(tx, context, true);
      const finalStatus = run.stopRequested ? "STOPPED" : status;
      const finishedAt = context.now();
      const updated = await tx.syncRun.update({ where: { id: run.id }, data: {
        status: finalStatus, finishedAt, durationMs: Math.max(0, finishedAt.getTime() - run.startedAt.getTime()),
        currentTrackingNumber: null, error: finalStatus === "FAILED" ? errorMessage(error) : null,
      } });
      await tx.syncJob.updateMany({ where: leaseWhere(context), data: {
        activeRunId: null, lockToken: null, lockedUntil: null,
        ...(context.runDate && (finalStatus === "COMPLETED" || finalStatus === "STOPPED")
          ? { lastRunDate: context.runDate } : {}),
      } });
      return updated;
    });
  } catch (failure) {
    if (!(failure instanceof LeaseLostError)) throw failure;
    await recoverInterruptedRuns(context.db, context.now);
    return context.db.syncRun.findUniqueOrThrow({ where: { id: context.run.id } });
  }
}

async function executeRun(context: RunContext): Promise<SyncRun> {
  const { db, now, fetchTracking, wait, run, candidates } = context;
  const abort = new AbortController();
  controllers.set(run.id, abort);
  let controlError: Error | null = null;
  let checking = false;
  let lastRenewed = now().getTime();
  const checkControl = async () => {
    if (abort.signal.aborted) throw abort.signal.reason;
    const [job, current] = await Promise.all([
      db.syncJob.findUnique({ where: { id: JOB_ID } }),
      db.syncRun.findUnique({ where: { id: run.id } }),
    ]);
    if (!job || job.activeRunId !== run.id || job.lockToken !== context.lockToken
      || !job.lockedUntil || job.lockedUntil <= now() || !current || !ACTIVE_STATUSES.includes(current.status)) {
      throw new LeaseLostError();
    }
    if (current.stopRequested || current.status === "STOPPING") throw new StopRequestedError();
    if (now().getTime() - lastRenewed >= 30_000) {
      await db.$transaction(async tx => { await fence(tx, context); });
      lastRenewed = now().getTime();
    }
  };
  // Cross-process Stop interrupts Chromium requests and Retry-After waits within one second.
  const monitor = setInterval(() => {
    if (checking) return;
    checking = true;
    void checkControl().catch(error => {
      controlError = error instanceof Error ? error : new Error("无法检查抓取状态");
      abort.abort(controlError);
    }).finally(() => { checking = false; });
  }, 1_000);
  monitor.unref();

  let finalStatus = "COMPLETED";
  let fatalError: unknown;
  try {
    let madeRequest = false;
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      await checkControl();
      if (madeRequest) await wait(REQUEST_INTERVAL_MS, abort.signal);
      await checkControl();
      const tracking = await db.tracking.findUnique({
        where: { id: candidate.id }, include: { logisticsCompany: { select: { name: true } } },
      });
      const ineligible = skipReason(tracking, context);
      if (!tracking || ineligible) {
        await recordSkipped(context, candidate, ineligible ?? "运单已删除");
        continue;
      }
      const attemptedAt = now();
      const unchangedTracking = {
        id: tracking.id, trackingNumber: tracking.trackingNumber, isArchived: false, status: tracking.status,
        logisticsCompanyId: tracking.logisticsCompanyId, updatedAt: tracking.updatedAt,
      };
      await db.$transaction(async tx => {
        await fence(tx, context);
        await tx.syncRun.update({ where: { id: run.id }, data: { currentTrackingNumber: tracking.trackingNumber } });
      });
      madeRequest = true;
      let result: ScraperResult | null = null;
      let lookupError: unknown;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await fetchTracking(context.scraperUrl, tracking, { signal: abort.signal });
            break;
          } catch (error) {
            if (!(error instanceof ScraperHttpError) || error.statusCode !== 429 || attempt === 1) throw error;
            await wait(Math.max(60_000, error.retryAfterMs), abort.signal);
            await checkControl();
            if (!await db.tracking.findFirst({ where: unchangedTracking, select: { id: true } })) break;
          }
        }
      } catch (error) {
        lookupError = error;
      }
      await checkControl();
      if (lookupError) {
        await db.$transaction(async tx => {
          await fence(tx, context);
          const updated = await tx.tracking.updateMany({ where: unchangedTracking, data: {
            lastSyncAttemptAt: attemptedAt, lastSyncError: errorMessage(lookupError),
          } });
          const reason = updated.count === 1 ? errorMessage(lookupError)
            : skipReason(await tx.tracking.findUnique({ where: { id: candidate.id } }), context, true);
          await recordProcessed(tx, context, candidate, updated.count === 1 ? "FAILED" : "SKIPPED", reason);
        });
        if (lookupError instanceof ScraperHttpError && lookupError.statusCode === 429 && index < candidates.length - 1) {
          await wait(Math.max(60_000, lookupError.retryAfterMs), abort.signal);
        }
        continue;
      }
      if (!result) {
        const changed = await db.tracking.findUnique({ where: { id: candidate.id } });
        await recordSkipped(context, candidate, skipReason(changed, context, true)!);
        continue;
      }
      const answer = result;
      await db.$transaction(async tx => {
        await fence(tx, context);
        const nextStatus = nextTrackingStatus(tracking.status, answer);
        const updated = await tx.tracking.updateMany({ where: unchangedTracking, data: {
          status: nextStatus, lastSyncAttemptAt: attemptedAt,
          lastSyncedAt: now(), lastSyncError: null,
        } });
        if (updated.count === 1) {
          await recordTrackingStatusChange(tx, {
            trackingId: tracking.id, trackingNumber: tracking.trackingNumber,
            fromStatus: tracking.status, toStatus: nextStatus,
            source: run.trigger === "scheduled" ? TrackingStatusChangeSource.SCHEDULED_SCRAPE : TrackingStatusChangeSource.MANUAL_SCRAPE,
            syncRunId: run.id, createdAt: now(),
          });
          for (const event of answer.events) {
            await tx.trackingEvent.upsert({
              where: { trackingId_eventKey: { trackingId: tracking.id, eventKey: event.eventKey } },
              create: { trackingId: tracking.id, ...event }, update: event,
            });
          }
        }
        const reason = updated.count === 1 ? null
          : skipReason(await tx.tracking.findUnique({ where: { id: candidate.id } }), context, true);
        await recordProcessed(tx, context, candidate, updated.count === 1 ? "SUCCEEDED" : "SKIPPED", reason);
      }, { timeout: 30_000 });
    }
  } catch (error) {
    fatalError = controlError ?? error;
    finalStatus = fatalError instanceof StopRequestedError ? "STOPPED"
      : fatalError instanceof LeaseLostError ? "INTERRUPTED" : "FAILED";
  } finally {
    clearInterval(monitor);
    controllers.delete(run.id);
  }
  return finishRun(context, finalStatus, fatalError);
}

export async function startManualTrackingSync(options: SyncOptions = {}): Promise<{
  started: boolean; run: SyncRun | null; reason?: string;
}> {
  const claimed = await claimRun("manual", options);
  if (!claimed.context) {
    const status = await getTrackingSyncStatus(options);
    return { started: false, run: status.activeRun, reason: claimed.reason };
  }
  void executeRun(claimed.context).catch(error => { console.error("[tracking-sync] Manual run failed", error); });
  return { started: true, run: claimed.context.run };
}

export async function runDailyTrackingSync(options: SyncOptions = {}): Promise<SyncSummary> {
  const claimed = await claimRun("scheduled", options);
  if (!claimed.context) return { acquired: false, succeeded: 0, failed: 0, skipped: 0 };
  const run = await executeRun(claimed.context);
  return { acquired: true, succeeded: run.succeeded, failed: run.failed, skipped: run.skipped };
}

export async function startRetryTrackingSync(sourceRunId: string, trackingId?: string, options: SyncOptions = {}): Promise<{
  started: boolean; run: SyncRun | null; reason?: string;
}> {
  const claimed = await claimRun("retry", options, { sourceRunId, trackingId });
  if (!claimed.context) {
    const status = await getTrackingSyncStatus(options);
    return { started: false, run: status.activeRun, reason: claimed.reason };
  }
  void executeRun(claimed.context).catch(error => { console.error("[tracking-sync] Retry run failed", error); });
  return { started: true, run: claimed.context.run };
}
