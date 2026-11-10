import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, after, beforeEach, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { getSyncRunItems } from "../lib/sync-run-items";
import {
  getTrackingSyncStatus, requestTrackingSyncStop, RetryTrackingError, runDailyTrackingSync,
  startManualTrackingSync, startRetryTrackingSync,
} from "../lib/tracking-sync";
import { parseScraperResponse } from "../lib/scraper";

const directory = mkdtempSync(path.join(tmpdir(), "sync-items-test-"));
const databaseUrl = `file:${path.join(directory, "test.db")}`;
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let currentTime = new Date("2026-11-10T05:00:00+08:00");
const now = () => currentTime;
const noWait = async () => {};
const answer = () => parseScraperResponse({ result: {
  current_stage: "in_transit", events: [{ time: "2026-11-09T21:00:00Z", stage: "in_transit", description: "Moving" }],
} });

before(() => {
  writeFileSync(path.join(directory, "test.db"), "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe",
  });
});
beforeEach(async () => {
  await db.trackingStatusLog.deleteMany();
  await db.tracking.deleteMany();
  await db.syncJob.deleteMany();
  await db.syncRun.deleteMany();
  await db.appSettings.deleteMany();
  currentTime = new Date("2026-11-10T05:00:00+08:00");
});
after(async () => { await db.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

async function waitForFinished(runId: string) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: runId } });
    if (!["RUNNING", "STOPPING"].includes(run.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Run did not finish");
}

async function seedFailedRun(ids: string[], id = "source") {
  const startedAt = new Date(currentTime.getTime() - 3600_000);
  const finishedAt = new Date(currentTime.getTime() - 60_000);
  await db.tracking.createMany({ data: ids.map(trackingId => ({
    id: trackingId, trackingNumber: `number-${trackingId}`, lastSyncAttemptAt: finishedAt, lastSyncError: "Original failure",
  })) });
  return db.syncRun.create({ data: {
    id, trigger: "manual", status: "COMPLETED", hasDetails: true,
    total: ids.length, processed: ids.length, failed: ids.length, startedAt, finishedAt,
    items: { create: ids.map(trackingId => ({
      trackingId, trackingNumber: `number-${trackingId}`, outcome: "FAILED", reason: "Original failure", createdAt: finishedAt,
    })) },
  } });
}

function abortable(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

test("each processed parcel has exactly one atomic outcome with concrete skip reasons and deleted-number snapshots", async () => {
  const ids = ["00-ok", "01-fail", "02-deleted", "03-archived", "04-delivered", "05-exception", "06-checked", "07-edited"];
  await db.tracking.createMany({ data: ids.map(id => ({ id, trackingNumber: `number-${id}` })) });
  await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, tracking) => {
    if (tracking.trackingNumber === "number-00-ok") {
      await db.tracking.delete({ where: { id: "02-deleted" } });
      await db.tracking.update({ where: { id: "03-archived" }, data: { isArchived: true } });
      await db.tracking.update({ where: { id: "04-delivered" }, data: { status: "DELIVERED" } });
      await db.tracking.update({ where: { id: "05-exception" }, data: { status: "EXCEPTION" } });
      await db.tracking.update({ where: { id: "06-checked" }, data: { lastSyncAttemptAt: now() } });
    }
    if (tracking.trackingNumber === "number-01-fail") throw new Error("Chromium failed to load USPS");
    if (tracking.trackingNumber === "number-07-edited") {
      await db.tracking.update({ where: { id: "07-edited" }, data: { note: "edited during lookup" } });
    }
    return answer();
  } });
  const run = await db.syncRun.findFirstOrThrow();
  assert.equal(run.hasDetails, true);
  assert.deepEqual([run.total, run.processed, run.succeeded, run.failed, run.skipped], [8, 8, 1, 1, 6]);
  const all = await db.syncRunItem.findMany({ where: { runId: run.id } });
  assert.equal(all.length, run.processed);
  assert.equal(new Set(all.map(item => item.trackingId)).size, run.processed);
  const failed = await getSyncRunItems(run.id, "FAILED", { db, now });
  assert.equal(failed?.recorded, true);
  assert.equal(failed?.legacyFallback, false);
  assert.equal(failed?.retryableCount, 1);
  assert.equal(failed?.items[0].reason, "Chromium failed to load USPS");
  const skipped = await getSyncRunItems(run.id, "SKIPPED", { db, now });
  assert.deepEqual(skipped?.items.map(item => [item.trackingNumber, item.reason]), [
    ["number-02-deleted", "运单已删除"], ["number-03-archived", "运单已归档"],
    ["number-04-delivered", "运单已签收"], ["number-05-exception", "运单处于异常状态"],
    ["number-06-checked", "当日已查询"], ["number-07-edited", "查询期间运单被修改"],
  ]);
  assert.ok(skipped?.items.every(item => !item.canRetry));
  assert.equal(skipped?.retryableCount, 0);
});

test("single and all retries are restricted to unresolved eligible failures and leave original history unchanged", async () => {
  let source = await seedFailedRun(["a", "b", "archived", "delivered", "exception", "deleted", "resolved"]);
  await db.tracking.createMany({ data: [
    { id: "success", trackingNumber: "success" },
    { id: "unrelated", trackingNumber: "unrelated", lastSyncError: "unrelated error" },
  ] });
  await db.syncRunItem.create({ data: { runId: source.id, trackingId: "success", trackingNumber: "success", outcome: "SUCCEEDED" } });
  source = await db.syncRun.update({ where: { id: source.id }, data: {
    total: { increment: 1 }, processed: { increment: 1 }, succeeded: { increment: 1 },
  } });
  await db.tracking.update({ where: { id: "archived" }, data: { isArchived: true } });
  await db.tracking.update({ where: { id: "delivered" }, data: { status: "DELIVERED" } });
  await db.tracking.update({ where: { id: "exception" }, data: { status: "EXCEPTION" } });
  await db.tracking.delete({ where: { id: "deleted" } });
  await db.tracking.update({ where: { id: "resolved" }, data: { lastSyncError: null } });
  const originalItems = await db.syncRunItem.findMany({ where: { runId: source.id } });
  const details = await getSyncRunItems(source.id, "FAILED", { db, now });
  assert.equal(details?.retryableCount, 2);
  assert.deepEqual(details?.items.filter(item => item.canRetry).map(item => item.trackingId), ["a", "b"]);
  for (const id of ["success", "unrelated", "archived", "delivered", "exception", "deleted", "resolved"]) {
    await assert.rejects(startRetryTrackingSync(source.id, id, { db, now, wait: noWait }),
      (error: unknown) => error instanceof RetryTrackingError && error.statusCode === 400);
  }
  await assert.rejects(startRetryTrackingSync("missing", undefined, { db, now }),
    (error: unknown) => error instanceof RetryTrackingError && error.statusCode === 404);
  assert.equal(await db.syncRun.count(), 1);
  const requested: string[] = [];
  const fetchTracking = async (_: string, tracking: { trackingNumber: string }) => {
    requested.push(tracking.trackingNumber); return answer();
  };
  const single = await startRetryTrackingSync(source.id, "a", { db, now, wait: noWait, fetchTracking });
  assert.ok(single.run);
  const singleFinished = await waitForFinished(single.run.id);
  assert.equal(singleFinished.trigger, "retry");
  assert.equal(singleFinished.retryOfRunId, source.id);
  assert.deepEqual(requested, ["number-a"]);
  const all = await startRetryTrackingSync(source.id, undefined, { db, now, wait: noWait, fetchTracking });
  assert.ok(all.run);
  await waitForFinished(all.run.id);
  assert.deepEqual(requested, ["number-a", "number-b"]);
  assert.deepEqual(await db.syncRun.findUniqueOrThrow({ where: { id: source.id } }), source);
  assert.deepEqual(await db.syncRunItem.findMany({ where: { runId: source.id } }), originalItems);
  assert.equal((await db.syncJob.findUniqueOrThrow({ where: { id: "daily-parcel-sync" } })).lastRunDate, null);
  await assert.rejects(startRetryTrackingSync(source.id, undefined, { db, now }), RetryTrackingError);
  assert.equal(await db.syncRun.count(), 3);
});

test("retry eligibility is rechecked after queue waits and descendant retries keep the root source", async () => {
  const source = await seedFailedRun(["a", "b"]);
  const requested: string[] = [];
  const retry = await startRetryTrackingSync(source.id, undefined, { db, now, wait: noWait, fetchTracking: async (_, tracking) => {
    requested.push(tracking.trackingNumber);
    await db.tracking.update({ where: { id: "b" }, data: { lastSyncError: null } });
    throw new Error("still failing");
  } });
  assert.ok(retry.run);
  const finished = await waitForFinished(retry.run.id);
  assert.deepEqual(requested, ["number-a"]);
  assert.equal(finished.failed, 1);
  assert.equal(finished.skipped, 1);
  const skipped = await getSyncRunItems(finished.id, "SKIPPED", { db, now });
  assert.match(skipped!.items[0].reason!, /已查询成功/);
  const descendant = await startRetryTrackingSync(finished.id, "a", { db, now, wait: noWait, fetchTracking: async () => answer() });
  assert.ok(descendant.run);
  await waitForFinished(descendant.run.id);
  assert.equal(descendant.run.retryOfRunId, source.id);
  assert.equal((await getSyncRunItems(source.id, "FAILED", { db, now }))?.retryableCount, 0);
});

test("retry runs share the global lock and repeated Stop preserves completed items without fabricated failures", async () => {
  const source = await seedFailedRun(["a", "b"]);
  let fetching!: () => void;
  const gate = new Promise<void>(resolve => { fetching = resolve; });
  const first = await startRetryTrackingSync(source.id, undefined, { db, now, wait: noWait, fetchTracking: async (_, __, options) => {
    fetching(); return abortable(options?.signal);
  } });
  assert.ok(first.run);
  await gate;
  assert.equal((await startManualTrackingSync({ db, now })).started, false);
  assert.equal((await runDailyTrackingSync({ db, now })).acquired, false);
  assert.equal((await startRetryTrackingSync(source.id, "a", { db, now })).started, false);
  await requestTrackingSyncStop(first.run.id, { db, now });
  await requestTrackingSyncStop(first.run.id, { db, now });
  const stopped = await waitForFinished(first.run.id);
  assert.equal(stopped.status, "STOPPED");
  assert.equal(stopped.processed, 0);
  assert.equal(await db.syncRunItem.count({ where: { runId: stopped.id } }), 0);
  let secondFetching!: () => void;
  const secondGate = new Promise<void>(resolve => { secondFetching = resolve; });
  const second = await startRetryTrackingSync(source.id, undefined, { db, now, wait: noWait, fetchTracking: async (_, tracking, options) => {
    if (tracking.trackingNumber === "number-a") return answer();
    secondFetching(); return abortable(options?.signal);
  } });
  assert.ok(second.run);
  await secondGate;
  await requestTrackingSyncStop(second.run.id, { db, now });
  const stoppedAgain = await waitForFinished(second.run.id);
  assert.deepEqual([stoppedAgain.processed, stoppedAgain.succeeded, stoppedAgain.failed, stoppedAgain.skipped], [1, 1, 0, 0]);
  assert.equal(await db.syncRunItem.count({ where: { runId: stoppedAgain.id } }), 1);
  const remaining = await getSyncRunItems(source.id, "FAILED", { db, now });
  assert.deepEqual(remaining?.items.filter(item => item.canRetry).map(item => item.trackingId), ["b"]);
  assert.equal((await getTrackingSyncStatus({ db, now })).activeRun, null);
});

test("legacy fallback is explicitly incomplete, uses the original attempt window and cannot authorize unrelated IDs", async () => {
  const startedAt = new Date("2026-11-10T03:00:00+08:00");
  const finishedAt = new Date("2026-11-10T04:00:00+08:00");
  const source = await db.syncRun.create({ data: {
    id: "legacy", trigger: "scheduled", status: "COMPLETED", total: 9, processed: 9, failed: 7, skipped: 2, startedAt, finishedAt,
  } });
  await db.tracking.createMany({ data: [
    { id: "inside", trackingNumber: "inside", lastSyncAttemptAt: finishedAt, lastSyncError: "old failure" },
    { id: "before", trackingNumber: "before", lastSyncAttemptAt: new Date(startedAt.getTime() - 1), lastSyncError: "other failure" },
    { id: "after", trackingNumber: "after", lastSyncAttemptAt: new Date(finishedAt.getTime() + 1), lastSyncError: "other failure" },
    { id: "resolved", trackingNumber: "resolved", lastSyncAttemptAt: finishedAt, lastSyncError: null },
  ] });
  const details = await getSyncRunItems(source.id, "FAILED", { db, now });
  assert.equal(details?.recorded, false);
  assert.equal(details?.legacyFallback, true);
  assert.equal(details?.expectedCount, 7);
  assert.equal(details?.retryableCount, 1);
  assert.deepEqual(details?.items.map(item => [item.id, item.trackingId]), [[null, "inside"]]);
  const skipped = await getSyncRunItems(source.id, "SKIPPED", { db, now });
  assert.equal(skipped?.recorded, false);
  assert.equal(skipped?.legacyFallback, false);
  assert.deepEqual(skipped?.items, []);
  assert.equal(skipped?.expectedCount, 2);
  for (const id of ["before", "after", "resolved"]) {
    await assert.rejects(startRetryTrackingSync(source.id, id, { db, now }), RetryTrackingError);
  }
  const newer = await db.syncRun.create({ data: {
    trigger: "manual", status: "COMPLETED", hasDetails: true, failed: 1, startedAt, finishedAt,
  } });
  const emptyRecorded = await getSyncRunItems(newer.id, "FAILED", { db, now });
  assert.equal(emptyRecorded?.recorded, true);
  assert.equal(emptyRecorded?.legacyFallback, false);
  assert.deepEqual(emptyRecorded?.items, []);
  const successfulLegacy = await db.syncRun.create({ data: {
    trigger: "manual", status: "COMPLETED", succeeded: 1, processed: 1, total: 1, startedAt, finishedAt,
  } });
  assert.deepEqual((await getSyncRunItems(successfulLegacy.id, "FAILED", { db, now }))?.items, []);
  await assert.rejects(startRetryTrackingSync(successfulLegacy.id, "inside", { db, now }), RetryTrackingError);
  assert.equal(await getSyncRunItems("missing", "FAILED", { db, now }), null);
});

test("legacy root keeps proven failed retry members without admitting other sources or claiming complete history", async () => {
  const startedAt = new Date("2026-11-10T03:00:00+08:00");
  const finishedAt = new Date("2026-11-10T04:00:00+08:00");
  const root = await db.syncRun.create({ data: {
    id: "legacy-root", trigger: "scheduled", status: "COMPLETED", total: 5, processed: 5, failed: 5, startedAt, finishedAt,
  } });
  await db.tracking.createMany({ data: [
    { id: "a", trackingNumber: "a", lastSyncAttemptAt: finishedAt, lastSyncError: "first failure" },
    { id: "b", trackingNumber: "b", lastSyncAttemptAt: finishedAt, lastSyncError: "untouched failure" },
    { id: "unrelated", trackingNumber: "unrelated", lastSyncAttemptAt: now(), lastSyncError: "unrelated failure" },
  ] });
  await db.syncRun.create({ data: {
    trigger: "retry", retryOfRunId: "another-source", status: "COMPLETED", hasDetails: true, failed: 1,
    items: { create: { trackingId: "unrelated", trackingNumber: "unrelated", outcome: "FAILED", reason: "unrelated failure" } },
  } });
  for (let attempt = 0; attempt < 2; attempt++) {
    currentTime = new Date(currentTime.getTime() + 60_000);
    const retry = await startRetryTrackingSync(root.id, "a", { db, now, wait: noWait,
      fetchTracking: async () => { throw new Error(`retry failure ${attempt}`); },
    });
    assert.ok(retry.run);
    await waitForFinished(retry.run.id);
    const remaining = await getSyncRunItems(root.id, "FAILED", { db, now });
    assert.equal(remaining?.recorded, false);
    assert.equal(remaining?.legacyFallback, true);
    assert.equal(remaining?.expectedCount, 5);
    assert.deepEqual(remaining?.items.map(item => item.trackingId).sort(), ["a", "b"]);
    assert.equal(remaining?.retryableCount, 2);
    await assert.rejects(startRetryTrackingSync(root.id, "unrelated", { db, now }), RetryTrackingError);
  }
  const success = await startRetryTrackingSync(root.id, "a", { db, now, wait: noWait, fetchTracking: async () => answer() });
  assert.ok(success.run);
  await waitForFinished(success.run.id);
  const remaining = await getSyncRunItems(root.id, "FAILED", { db, now });
  assert.deepEqual(remaining?.items.map(item => item.trackingId), ["b"]);
  assert.equal(remaining?.recorded, false);
  assert.equal((await db.syncRun.findUniqueOrThrow({ where: { id: root.id } })).failed, 5);
});
