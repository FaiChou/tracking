import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, after, beforeEach, test } from "node:test";
import { PrismaClient, TrackingStatus } from "@prisma/client";
import { getTrackingSyncStatus, requestTrackingSyncStop, runDailyTrackingSync, startManualTrackingSync } from "../lib/tracking-sync";
import { parseScraperResponse, ScraperHttpError } from "../lib/scraper";

const directory = mkdtempSync(path.join(tmpdir(), "tracking-sync-test-"));
const databaseUrl = `file:${path.join(directory, "test.db")}`;
const db = new PrismaClient({ datasourceUrl: databaseUrl });
let currentTime = new Date("2026-11-10T05:00:00+08:00");
const now = () => currentTime;
const noWait = async () => {};
const response = (stage: string, date = "2026-11-10T04:00:00+08:00") => parseScraperResponse({
  result: { current_stage: stage, events: [{ time: date, stage, description: `Parcel ${stage}` }] },
});

before(() => {
  // Prisma 6's SQLite engine expects the database file to exist for migrate deploy.
  writeFileSync(path.join(directory, "test.db"), "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe",
  });
});
beforeEach(async () => {
  await db.tracking.deleteMany();
  await db.syncJob.deleteMany();
  await db.syncRun.deleteMany();
  await db.appSettings.deleteMany();
  currentTime = new Date("2026-11-10T05:00:00+08:00");
});
after(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

test("daily sync excludes archived/final/exception rows, runs serially and updates directly to delivered", async () => {
  for (const [id, status, isArchived] of [
    ["pending", "PENDING", false], ["moving", "TRANSIT", false],
    ["delivered", "DELIVERED", false], ["exception", "EXCEPTION", false],
    ["archived", "PENDING", true],
  ] as const) {
    await db.tracking.create({ data: { id, trackingNumber: id, status, isArchived } });
  }
  let active = 0;
  let peak = 0;
  const requested: string[] = [];
  const summary = await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, tracking) => {
    active++;
    peak = Math.max(peak, active);
    requested.push(tracking.trackingNumber);
    await new Promise(resolve => setTimeout(resolve, 10));
    active--;
    return response("delivered");
  } });
  assert.equal(summary.succeeded, 2);
  assert.equal(peak, 1);
  assert.deepEqual(requested.sort(), ["moving", "pending"]);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { id: "pending" } })).status, "DELIVERED");
  assert.equal(await db.trackingEvent.count(), 2);
  assert.equal((await runDailyTrackingSync({ db, now, wait: noWait })).acquired, false);
});

test("successful syncs merge history, deduplicate scans, and failures keep cached events and status", async () => {
  await db.tracking.create({ data: { id: "parcel", trackingNumber: "parcel" } });
  await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => response("accepted") });
  currentTime = new Date("2026-11-11T05:00:00+08:00");
  await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => response("accepted") });
  assert.equal(await db.trackingEvent.count(), 1);
  currentTime = new Date("2026-11-12T05:00:00+08:00");
  await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => response("in_transit", "2026-11-12T00:00:00Z") });
  assert.equal(await db.trackingEvent.count(), 2);
  const beforeFailure = await db.tracking.findUniqueOrThrow({ where: { id: "parcel" } });
  currentTime = new Date("2026-11-13T05:00:00+08:00");
  await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => { throw new Error("Chromium timeout"); } });
  const afterFailure = await db.tracking.findUniqueOrThrow({ where: { id: "parcel" } });
  assert.equal(afterFailure.status, "TRANSIT");
  assert.equal(afterFailure.lastSyncedAt?.getTime(), beforeFailure.lastSyncedAt?.getTime());
  assert.equal(afterFailure.lastSyncError, "Chromium timeout");
  assert.equal(await db.trackingEvent.count(), 2);
});

test("parallel workers acquire only one database lease", async () => {
  await db.tracking.create({ data: { id: "parcel", trackingNumber: "parcel" } });
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const startedGate = new Promise<void>(resolve => { started = resolve; });
  const first = runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => {
    calls++;
    started();
    await gate;
    return response("in_transit");
  } });
  await startedGate;
  const second = await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => {
    calls++;
    return response("delivered");
  } });
  release();
  await first;
  assert.equal(second.acquired, false);
  assert.equal(calls, 1);
});

test("manual archival or status changes while Chromium runs cannot be overwritten", async () => {
  await db.tracking.create({ data: { id: "parcel", trackingNumber: "parcel" } });
  const summary = await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async () => {
    await db.tracking.update({ where: { id: "parcel" }, data: { isArchived: true, status: "EXCEPTION" } });
    return response("delivered");
  } });
  const tracking = await db.tracking.findUniqueOrThrow({ where: { id: "parcel" } });
  assert.equal(summary.skipped, 1);
  assert.equal(tracking.status, "EXCEPTION");
  assert.equal(tracking.isArchived, true);
  assert.equal(await db.trackingEvent.count(), 0);
});

test("expired lease permits restart, rechecks queue eligibility and avoids repeated daily attempts", async () => {
  await db.syncJob.create({ data: {
    id: "daily-parcel-sync", lockToken: "dead-worker", lockedUntil: new Date(currentTime.getTime() - 1),
  } });
  await db.tracking.createMany({ data: [
    { id: "done", trackingNumber: "done", lastSyncAttemptAt: currentTime },
    { id: "todo", trackingNumber: "todo", createdAt: new Date("2026-11-01T00:00:00Z") },
    { id: "later", trackingNumber: "later", createdAt: new Date("2026-11-02T00:00:00Z") },
  ] });
  const requested: string[] = [];
  await runDailyTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, tracking) => {
    requested.push(tracking.trackingNumber);
    await db.tracking.update({ where: { id: "later" }, data: { status: TrackingStatus.DELIVERED } });
    return response("in_transit");
  } });
  assert.deepEqual(requested, ["todo"]);
});

test("a transient rate limit retries the same parcel once after Retry-After", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  let calls = 0;
  const waits: number[] = [];
  const summary = await runDailyTrackingSync({ db, now, wait: async milliseconds => { waits.push(milliseconds); },
    fetchTracking: async () => {
      calls++;
      if (calls === 1) throw new ScraperHttpError("rate limited", 429, 120000);
      return response("delivered");
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [120000]);
  assert.equal(summary.succeeded, 1);
});

test("persistent rate limiting is bounded and does not starve remaining parcels after cooldown", async () => {
  await db.tracking.createMany({ data: [
    { id: "one", trackingNumber: "one" }, { id: "two", trackingNumber: "two" },
  ] });
  const requested: string[] = [];
  const waits: number[] = [];
  const summary = await runDailyTrackingSync({ db, now, wait: async ms => { waits.push(ms); }, fetchTracking: async (_, tracking) => {
    requested.push(tracking.trackingNumber);
    if (tracking.trackingNumber === "one") throw new ScraperHttpError("rate limited", 429, 120000);
    return response("delivered");
  } });
  assert.deepEqual(requested, ["one", "one", "two"]);
  assert.deepEqual(waits, [120000, 120000, 2000]);
  assert.equal(summary.succeeded, 1);
  assert.equal(summary.failed, 1);
  assert.equal((await runDailyTrackingSync({ db, now, wait: noWait })).acquired, false);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { id: "one" } })).lastSyncError, "rate limited");
});

async function waitForFinished(runId: string) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const run = await db.syncRun.findUniqueOrThrow({ where: { id: runId } });
    if (!["RUNNING", "STOPPING"].includes(run.status)) return run;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Background run did not finish");
}

function abortableLookup(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) reject(signal.reason);
    else signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

test("manual start returns while fetching, persists live progress and ignores daily attempt filtering", async () => {
  currentTime = new Date("2026-11-10T02:00:00+08:00");
  await db.tracking.createMany({ data: [
    { id: "one", trackingNumber: "one", lastSyncAttemptAt: currentTime, createdAt: new Date("2026-11-01") },
    { id: "two", trackingNumber: "two", createdAt: new Date("2026-11-02") },
  ] });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let secondStarted!: () => void;
  const secondGate = new Promise<void>(resolve => { secondStarted = resolve; });
  const started = await startManualTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, tracking) => {
    if (tracking.trackingNumber === "two") { secondStarted(); await gate; }
    return response("in_transit");
  } });
  assert.equal(started.started, true);
  assert.ok(started.run);
  await secondGate;
  const progress = await getTrackingSyncStatus({ db, now });
  assert.equal(progress.activeRun?.id, started.run.id);
  assert.equal(progress.activeRun?.trigger, "manual");
  assert.equal(progress.activeRun?.processed, 1);
  assert.equal(progress.activeRun?.succeeded, 1);
  assert.equal(progress.activeRun?.total, 2);
  assert.equal(progress.activeRun?.currentTrackingNumber, "two");
  const duplicate = await startManualTrackingSync({ db, now, wait: noWait });
  assert.equal(duplicate.started, false);
  assert.equal(duplicate.run?.id, started.run.id);
  release();
  const finished = await waitForFinished(started.run.id);
  assert.equal(finished.status, "COMPLETED");
  assert.equal(finished.processed, 2);
  assert.equal(finished.succeeded, 2);
  const refreshed = await getTrackingSyncStatus({ db, now });
  assert.equal(refreshed.activeRun, null);
  assert.equal(refreshed.lastRun?.id, started.run.id);
  assert.equal((await db.syncJob.findUniqueOrThrow({ where: { id: "daily-parcel-sync" } })).lastRunDate, null);
});

test("Stop aborts in-flight manual fetch and preserves completed items without counting cancellation as failure", async () => {
  await db.tracking.createMany({ data: [
    { id: "one", trackingNumber: "one", createdAt: new Date("2026-11-01") },
    { id: "two", trackingNumber: "two", createdAt: new Date("2026-11-02") },
  ] });
  let fetching!: () => void;
  const fetchGate = new Promise<void>(resolve => { fetching = resolve; });
  const started = await startManualTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, tracking, options) => {
    if (tracking.trackingNumber === "one") return response("in_transit");
    fetching();
    return abortableLookup(options?.signal);
  } });
  await fetchGate;
  assert.ok(started.run);
  const stopping = await requestTrackingSyncStop(started.run.id, { db, now });
  assert.equal(stopping?.status, "STOPPING");
  const finished = await waitForFinished(started.run.id);
  assert.equal(finished.status, "STOPPED");
  assert.equal(finished.processed, 1);
  assert.equal(finished.succeeded, 1);
  assert.equal(finished.failed, 0);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { id: "two" } })).lastSyncAttemptAt, null);
  assert.equal(await db.trackingEvent.count(), 1);
});

test("cross-process stop markers interrupt long fetches through the database monitor", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  let fetching!: () => void;
  const gate = new Promise<void>(resolve => { fetching = resolve; });
  const started = await startManualTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, __, options) => {
    fetching();
    return abortableLookup(options?.signal);
  } });
  assert.ok(started.run);
  await gate;
  // Simulate another Node process: write the stop flag without accessing the global controller.
  await db.syncRun.update({ where: { id: started.run.id }, data: { status: "STOPPING", stopRequested: true } });
  const finished = await waitForFinished(started.run.id);
  assert.equal(finished.status, "STOPPED");
  assert.equal(finished.processed, 0);
  assert.equal(finished.failed, 0);
});

test("a successful response arriving after Stop cannot persist even when fetch ignores AbortSignal", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  const started = await startManualTrackingSync({ db, now, wait: noWait, fetchTracking: async () => {
    const activeRun = await db.syncRun.findFirstOrThrow({ where: { status: "RUNNING" } });
    await requestTrackingSyncStop(activeRun.id, { db, now });
    // Deliberately ignore the aborted signal and return a valid delivered result.
    return response("delivered");
  } });
  assert.ok(started.run);
  const finished = await waitForFinished(started.run.id);
  assert.equal(finished.status, "STOPPED");
  assert.equal(finished.processed, 0);
  assert.equal(finished.succeeded, 0);
  assert.equal(finished.failed, 0);
  assert.equal(finished.skipped, 0);
  const tracking = await db.tracking.findUniqueOrThrow({ where: { id: "one" } });
  assert.equal(tracking.status, "PENDING");
  assert.equal(tracking.lastSyncedAt, null);
  assert.equal(tracking.lastSyncAttemptAt, null);
  assert.equal(tracking.lastSyncError, null);
  assert.equal(await db.trackingEvent.count(), 0);
});

test("Stop interrupts Retry-After waits and scheduled stops prevent automatic restarts that day", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  let waiting!: () => void;
  const gate = new Promise<void>(resolve => { waiting = resolve; });
  const running = runDailyTrackingSync({ db, now, wait: async (_, signal) => {
    waiting();
    return abortableLookup(signal);
  }, fetchTracking: async () => { throw new ScraperHttpError("rate limited", 429, 120000); } });
  await gate;
  const { activeRun } = await getTrackingSyncStatus({ db, now });
  assert.ok(activeRun);
  await requestTrackingSyncStop(activeRun.id, { db, now });
  const summary = await running;
  assert.equal(summary.failed, 0);
  assert.equal((await getTrackingSyncStatus({ db, now })).lastRun?.status, "STOPPED");
  assert.equal((await runDailyTrackingSync({ db, now, wait: noWait })).acquired, false);
  assert.equal((await db.syncJob.findUniqueOrThrow({ where: { id: "daily-parcel-sync" } })).lastRunDate, "2026-11-10");
});

test("expired owners become interrupted and late responses cannot overwrite a new run or release its lease", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  let releaseOld!: () => void;
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  let oldFetching!: () => void;
  const oldStarted = new Promise<void>(resolve => { oldFetching = resolve; });
  const old = await startManualTrackingSync({ db, now, wait: noWait, fetchTracking: async () => {
    oldFetching(); await oldGate; return response("delivered");
  } });
  assert.ok(old.run);
  await oldStarted;
  currentTime = new Date(currentTime.getTime() + 6 * 60_000);
  const recovered = await getTrackingSyncStatus({ db, now });
  assert.equal(recovered.activeRun, null);
  assert.equal(recovered.lastRun?.status, "INTERRUPTED");
  let freshFetching!: () => void;
  const freshStarted = new Promise<void>(resolve => { freshFetching = resolve; });
  const fresh = await startManualTrackingSync({ db, now, wait: noWait, fetchTracking: async (_, __, options) => {
    freshFetching(); return abortableLookup(options?.signal);
  } });
  assert.ok(fresh.run);
  await freshStarted;
  releaseOld();
  await new Promise(resolve => setTimeout(resolve, 20));
  const afterLateResponse = await getTrackingSyncStatus({ db, now });
  assert.equal(afterLateResponse.activeRun?.id, fresh.run.id);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { id: "one" } })).status, "PENDING");
  assert.equal(await db.trackingEvent.count(), 0);
  assert.equal((await requestTrackingSyncStop(old.run.id, { db, now }))?.status, "INTERRUPTED");
  assert.equal((await getTrackingSyncStatus({ db, now })).activeRun?.status, "RUNNING");
  await requestTrackingSyncStop(fresh.run.id, { db, now });
  await waitForFinished(fresh.run.id);
});

test("configured minute precision controls scheduling and completed dates remain idempotent", async () => {
  await db.appSettings.create({ data: { id: "default", dailySyncTime: "08:37" } });
  currentTime = new Date("2026-11-10T08:36:59+08:00");
  assert.equal((await runDailyTrackingSync({ db, now, wait: noWait })).acquired, false);
  currentTime = new Date("2026-11-10T08:37:00+08:00");
  assert.equal((await runDailyTrackingSync({ db, now, wait: noWait })).acquired, true);
  await db.appSettings.update({ where: { id: "default" }, data: { dailySyncTime: "09:00" } });
  currentTime = new Date("2026-11-10T09:00:00+08:00");
  assert.equal((await runDailyTrackingSync({ db, now, wait: noWait })).acquired, false);
});

test("simultaneous starts from independent database clients create only one active run", async () => {
  const secondDb = new PrismaClient({ datasourceUrl: databaseUrl });
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const fetchTracking = async () => { calls++; await gate; return response("in_transit"); };
  try {
    const results = await Promise.all([
      startManualTrackingSync({ db, now, wait: noWait, fetchTracking }),
      startManualTrackingSync({ db: secondDb, now, wait: noWait, fetchTracking }),
    ]);
    assert.equal(results.filter(result => result.started).length, 1);
    const started = results.find(result => result.started)!;
    assert.ok(started.run);
    assert.equal(await db.syncRun.count(), 1);
    release();
    await waitForFinished(started.run.id);
    assert.equal(calls, 1);
  } finally {
    release();
    const active = await db.syncRun.findMany({ where: { status: { in: ["RUNNING", "STOPPING"] } } });
    for (const run of active) await waitForFinished(run.id);
    await secondDb.$disconnect();
  }
});
