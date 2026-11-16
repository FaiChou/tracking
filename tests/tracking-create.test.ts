import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const directory = mkdtempSync(path.join(tmpdir(), "tracking-create-test-"));
const databaseUrl = `file:${path.join(directory, "test.db")}`;
const previousDatabaseUrl = process.env.DATABASE_URL;
let db: PrismaClient;
let createTracking: typeof import("../app/api/trackings/route").POST;
let createTrackings: typeof import("../app/api/trackings/batch/route").POST;

before(async () => {
  writeFileSync(path.join(directory, "test.db"), "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: "pipe",
  });
  // Node's test runner isolates files in separate processes. Import the route singleton only
  // after selecting this disposable database, so real route requests cannot touch user data.
  process.env.DATABASE_URL = databaseUrl;
  db = (await import("../lib/prisma")).prisma;
  createTracking = (await import("../app/api/trackings/route")).POST;
  createTrackings = (await import("../app/api/trackings/batch/route")).POST;
});
beforeEach(async () => {
  await db.tracking.deleteMany();
  await db.logisticsCompany.deleteMany();
});
after(async () => {
  await db?.$disconnect();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  rmSync(directory, { recursive: true, force: true });
});

function request(body: unknown) {
  return new NextRequest("http://localhost/api/trackings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("single creation cleans hidden characters before carrier detection, storage and duplicate checks", async () => {
  const company = await db.logisticsCompany.create({ data: { name: "UPS", trackingUrl: "https://example.test/" } });
  const note = "  原样保留\u200b备注\u00a0  ";
  const reply = await createTracking(request({ trackingNumber: "\ufeff1\u200bZ999AA10123456784\u2060\u00a0", note }));
  assert.equal(reply.status, 200);
  const saved = await db.tracking.findFirstOrThrow();
  assert.equal(saved.trackingNumber, "1Z999AA10123456784");
  assert.equal(saved.logisticsCompanyId, company.id);
  assert.equal(saved.note, note);

  const duplicate = await createTracking(request({ trackingNumber: "1Z999AA10123456784\u200b" }));
  assert.equal(duplicate.status, 400);
  assert.equal(await db.tracking.count(), 1);
});

test("batch creation deduplicates cleaned numbers, keeps the first note and counts all skipped rows", async () => {
  const company = await db.logisticsCompany.create({ data: { name: "FedEx", trackingUrl: "https://example.test/" } });
  await db.tracking.create({ data: { trackingNumber: "EXISTING", note: "unchanged" } });
  const note = "首条\u200b备注 保持不变";
  const reply = await createTrackings(request({ trackingsWithNotes: [
    { trackingNumber: "EXIST\u200bING", note: "replacement" },
    { trackingNumber: "AB\u200c123\ufeff", note },
    { trackingNumber: "AB123", note: "second note" },
    { trackingNumber: "12\u20603456789012", note: null },
  ] }));
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), { created: 2, skipped: 2 });
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { trackingNumber: "AB123" } })).note, note);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { trackingNumber: "123456789012" } })).logisticsCompanyId, company.id);
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { trackingNumber: "EXISTING" } })).note, "unchanged");
});

test("legacy batch requests also clean and deduplicate trackingNumbers", async () => {
  await db.tracking.create({ data: { trackingNumber: "EXISTING" } });
  const reply = await createTrackings(request({ trackingNumbers: ["\u200bNEW123", "NEW123\u00ad", "EXISTING\u200b"] }));
  assert.equal(reply.status, 200);
  assert.deepEqual(await reply.json(), { created: 1, skipped: 2 });
  assert.equal((await db.tracking.findUniqueOrThrow({ where: { trackingNumber: "NEW123" } })).note, null);
});

test("single creation rejects non-strings and numbers emptied by cleaning", async () => {
  for (const trackingNumber of [null, 12345, {}, [], "", " \u200b\ufeff\t\u2060"]) {
    const reply = await createTracking(request({ trackingNumber }));
    assert.equal(reply.status, 400, `Unexpected status for ${JSON.stringify(trackingNumber)}`);
  }
  assert.equal((await createTracking(request({}))).status, 400);
  assert.equal(await db.tracking.count(), 0);
});

test("batch validation rejects the whole request before saving any valid entries", async () => {
  for (const trackingNumber of [null, 12345, {}, [], "", "\u200b\ufeff \u2060"]) {
    for (const body of [
      { trackingsWithNotes: [{ trackingNumber: "VALID123", note: null }, { trackingNumber, note: null }] },
      { trackingNumbers: ["VALID123", trackingNumber] },
    ]) {
      const reply = await createTrackings(request(body));
      assert.equal(reply.status, 400, `Unexpected status for ${JSON.stringify(body)}`);
      assert.equal(await db.tracking.count(), 0);
    }
  }
  for (const body of [{ trackingsWithNotes: [] }, { trackingNumbers: [] }, { trackingsWithNotes: [null] }, { trackingsWithNotes: [{}] }]) {
    assert.equal((await createTrackings(request(body))).status, 400);
  }
});

test("creation leaves legacy stored tracking numbers and timestamps unchanged", async () => {
  const legacy = await db.tracking.create({ data: { trackingNumber: "OLD\u200b123", note: "original" } });
  assert.equal((await createTracking(request({ trackingNumber: "\u200bNEW-SINGLE" }))).status, 200);
  assert.equal((await createTrackings(request({ trackingNumbers: ["\u200bNEW-BATCH"] }))).status, 200);
  assert.deepEqual(await db.tracking.findUniqueOrThrow({ where: { id: legacy.id } }), legacy);
});
