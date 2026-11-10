import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { before, after, beforeEach, test } from "node:test";
import { PrismaClient, TrackingStatusChangeSource } from "@prisma/client";
import { NextRequest } from "next/server";
import { PATCH } from "../app/api/trackings/[id]/route";
import { recordTrackingStatusChange, STATUS_CHANGE_LOG_LIMIT } from "../lib/tracking-status-log";
import { InvalidTrackingPatchError, updateTracking } from "../lib/update-tracking";

const directory = mkdtempSync(path.join(tmpdir(), "tracking-log-test-"));
const databaseUrl = `file:${path.join(directory, "test.db")}`;
const db = new PrismaClient({ datasourceUrl: databaseUrl });
const timestamp = new Date("2026-11-10T05:00:00+08:00");

before(() => {
  writeFileSync(path.join(directory, "test.db"), "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe",
  });
});
beforeEach(async () => {
  await db.trackingStatusLog.deleteMany();
  await db.tracking.deleteMany();
  await db.logisticsCompany.deleteMany();
  await db.forwarder.deleteMany();
});
after(async () => {
  await db.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

test("manual status edits record exact transitions, retain response relations and survive parcel deletion", async () => {
  const company = await db.logisticsCompany.create({ data: { name: "UPS", trackingUrl: "https://example.test/" } });
  const forwarder = await db.forwarder.create({ data: { name: "Test Forwarder" } });
  await db.tracking.create({ data: {
    id: "one", trackingNumber: "parcel-one", isArchived: true,
    logisticsCompanyId: company.id, forwarderId: forwarder.id,
  } });
  const first = await updateTracking("one", { status: "TRANSIT", note: "first edit" }, db);
  assert.equal(first?.status, "TRANSIT");
  assert.equal(first?.isArchived, true);
  assert.equal(first?.logisticsCompany?.name, "UPS");
  assert.equal(first?.forwarder?.name, "Test Forwarder");
  await updateTracking("one", { status: "TRANSIT", note: "same status" }, db);
  await updateTracking("one", { note: "note only", isUrgent: true, logisticsCompanyId: null }, db);
  assert.equal(await db.trackingStatusLog.count(), 1);
  await updateTracking("one", { status: "DELIVERED" }, db);
  const logs = await db.trackingStatusLog.findMany({ orderBy: { id: "asc" } });
  assert.deepEqual(logs.map(log => [log.trackingNumber, log.fromStatus, log.toStatus, log.source, log.syncRunId]), [
    ["parcel-one", "PENDING", "TRANSIT", "MANUAL_EDIT", null],
    ["parcel-one", "TRANSIT", "DELIVERED", "MANUAL_EDIT", null],
  ]);
  await db.tracking.delete({ where: { id: "one" } });
  assert.equal(await db.trackingStatusLog.count(), 2);
  assert.equal(await updateTracking("missing", { status: "DELIVERED" }, db), null);
});

test("invalid status inputs return HTTP 400 and cannot mutate tracking or logs", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  for (const status of ["INVALID", "delivered", "", null, 123, {}]) {
    await assert.rejects(updateTracking("one", { status }, db), InvalidTrackingPatchError);
    // Validation happens before any database access, so this also tests the route's 400 mapping safely.
    const reply = await PATCH(new NextRequest("http://localhost/api/trackings/one", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }), { params: Promise.resolve({ id: "one" }) });
    assert.equal(reply.status, 400);
  }
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { id: "one" } })).status, "PENDING");
  assert.equal(await db.trackingStatusLog.count(), 0);
});

test("status logs retain the newest 500 globally in stable insertion order even with equal timestamps", async () => {
  const sources = Object.values(TrackingStatusChangeSource);
  await db.$transaction(async tx => {
    assert.equal(await recordTrackingStatusChange(tx, {
      trackingId: "unchanged", trackingNumber: "unchanged", fromStatus: "PENDING", toStatus: "PENDING",
      source: "MANUAL_EDIT", createdAt: timestamp,
    }), null);
    for (let index = 0; index < STATUS_CHANGE_LOG_LIMIT + 3; index++) {
      await recordTrackingStatusChange(tx, {
        trackingId: `tracking-${index % 2}`, trackingNumber: `parcel-${index}`,
        fromStatus: "PENDING", toStatus: "TRANSIT", source: sources[index % sources.length], createdAt: timestamp,
      });
    }
  }, { timeout: 30_000 });
  const logs = await db.trackingStatusLog.findMany({ orderBy: { id: "desc" } });
  assert.equal(logs.length, 500);
  assert.equal(logs[0].trackingNumber, "parcel-502");
  assert.equal(logs[499].trackingNumber, "parcel-3");
  assert.ok(logs.every(log => log.createdAt.getTime() === timestamp.getTime()));
  assert.equal(new Set(logs.map(log => log.source)).size, 3);
});

test("status update, log insertion and retention pruning roll back as one transaction", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  await db.trackingStatusLog.createMany({ data: Array.from({ length: 500 }, (_, index) => ({
    trackingId: `old-${index}`, trackingNumber: `old-${index}`, fromStatus: "PENDING", toStatus: "TRANSIT",
    source: "MANUAL_EDIT", createdAt: timestamp,
  })) });
  const originalIds = (await db.trackingStatusLog.findMany({ orderBy: { id: "asc" }, select: { id: true } })).map(log => log.id);
  await assert.rejects(db.$transaction(async tx => {
    await tx.tracking.update({ where: { id: "one" }, data: { status: "TRANSIT" } });
    await recordTrackingStatusChange(tx, {
      trackingId: "one", trackingNumber: "one", fromStatus: "PENDING", toStatus: "TRANSIT", source: "MANUAL_EDIT",
    });
    assert.equal(await tx.trackingStatusLog.count(), 500);
    throw new Error("rollback after pruning");
  }), /rollback after pruning/);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { id: "one" } })).status, "PENDING");
  assert.deepEqual((await db.trackingStatusLog.findMany({ orderBy: { id: "asc" }, select: { id: true } })).map(log => log.id), originalIds);
});

test("manual edit rolls back the parcel when writing its status log fails", async () => {
  await db.tracking.create({ data: { id: "one", trackingNumber: "one" } });
  await db.$executeRawUnsafe("CREATE TRIGGER reject_status_log BEFORE INSERT ON TrackingStatusLog BEGIN SELECT RAISE(ABORT, 'test log rejection'); END");
  try {
    await assert.rejects(updateTracking("one", { status: "TRANSIT", note: "must roll back" }, db));
    const tracking = await db.tracking.findUniqueOrThrow({ where: { id: "one" } });
    assert.equal(tracking.status, "PENDING");
    assert.equal(tracking.note, null);
    assert.equal(await db.trackingStatusLog.count(), 0);
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER reject_status_log");
  }
});
