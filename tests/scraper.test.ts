import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchParcel, mapScraperStage, parseScraperResponse, scraperCarrier, ScraperHttpError,
} from "../lib/scraper";
import {
  getDueRunDate, nextScheduledAt, normalizeDailySyncTime, normalizeDailySyncTimes, runDateStart, schedulerEnabled,
} from "../lib/tracking-schedule";

test("official stages map to business statuses without turning unknown states into exceptions", () => {
  for (const stage of ["pending", "registered"]) assert.equal(mapScraperStage(stage), "PENDING");
  for (const stage of ["accepted", "in_transit", "out_for_delivery", "customs", "ready_for_pickup"]) {
    assert.equal(mapScraperStage(stage), "TRANSIT");
  }
  assert.equal(mapScraperStage("delivered"), "DELIVERED");
  for (const stage of ["failed_attempt", "returned", "exception"]) assert.equal(mapScraperStage(stage), "EXCEPTION");
  assert.equal(mapScraperStage("unknown_new_stage"), null);
  assert.equal(mapScraperStage(null), null);
});

test("response parsing retains full events, local clocks and ordering while deduplicating repeats", () => {
  const event = {
    time: "2026-11-10T09:12:00", instant: null,
    description: "Delivered to reception", location: "New York", stage: "delivered", tie_order: 2,
  };
  const result = parseScraperResponse({ carrier: "usps", source: "usps", result: {
    current_stage: "delivered", events: [event, event, {
      time: "2026-11-09T12:00:00-05:00", instant: "2026-11-09T17:00:00Z",
      description: "In transit", stage: "in_transit",
    }],
  }, attempts: [] });
  assert.equal(result.status, "DELIVERED");
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].occurredAt, null);
  assert.equal(result.events[0].timeText, event.time);
  assert.equal(result.events[0].tieOrder, 2);
  assert.equal(result.events[1].occurredAt?.toISOString(), "2026-11-09T17:00:00.000Z");
});

test("summary-only answers persist a usable timeline entry and missing stage follows newest scan", () => {
  const summary = parseScraperResponse({ result: {
    current_stage: "delivered", summary_only: true, events: [],
    last_status_text: "Delivered", last_update: "2026-11-10T10:00:00Z",
  } });
  assert.equal(summary.events[0].description, "Delivered");
  const scans = parseScraperResponse({ result: { events: [
    { time: "2026-11-08", stage: "registered" },
    { time: "2026-11-10", stage: "delivered" },
  ] } });
  assert.equal(scans.status, "DELIVERED");
  assert.throws(() => parseScraperResponse({ result: {} }));
  assert.throws(() => parseScraperResponse({ result: { events: "bad" } }));
  assert.throws(() => parseScraperResponse({ error: "not_found" }));
});

test("unknown carrier display names use scraper detection instead of made-up carrier IDs", () => {
  assert.equal(scraperCarrier("FedEx"), "fedex");
  assert.equal(scraperCarrier("EMS"), "ems");
  assert.equal(scraperCarrier("17track"), undefined);
  assert.equal(scraperCarrier("自定义物流公司"), undefined);
});

test("HTTP client uses POST /v1/track with bounded browser budget and handles rate limits", async () => {
  let requested: { url: string; init?: RequestInit } | null = null;
  const fetchMock = (async (url: string | URL | Request, init?: RequestInit) => {
    requested = { url: String(url), init };
    return Response.json({ result: { current_stage: "in_transit", events: [] } });
  }) as typeof fetch;
  await fetchParcel("http://127.0.0.1:18080/prefix/", {
    trackingNumber: "9214490416421811474208", logisticsCompany: { name: "USPS" },
  }, { fetch: fetchMock });
  assert.ok(requested);
  const request = requested as { url: string; init: RequestInit };
  assert.equal(request.url, "http://127.0.0.1:18080/prefix/v1/track");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(String(request.init.body)), {
    number: "9214490416421811474208", carrier: "usps", budgetMs: 120000,
  });
  await assert.rejects(fetchParcel("http://localhost", {
    trackingNumber: "test", logisticsCompany: null,
  }, { fetch: (async () => Response.json({ error: "rate_limited" }, {
    status: 429, headers: { "retry-after": "120" },
  })) as typeof fetch }), (error: unknown) => {
    assert.ok(error instanceof ScraperHttpError);
    assert.equal(error.retryAfterMs, 120000);
    return true;
  });
});

test("daily scheduling follows Shanghai 05:00 across UTC dates and excludes builds/development", () => {
  assert.equal(getDueRunDate(new Date("2026-11-09T20:59:59Z")), null);
  assert.equal(getDueRunDate(new Date("2026-11-09T21:00:00Z")), "2026-11-10");
  assert.equal(getDueRunDate(new Date("2026-11-10T14:00:00Z")), "2026-11-10");
  assert.equal(runDateStart("2026-11-10").toISOString(), "2026-11-09T21:00:00.000Z");
  assert.equal(schedulerEnabled({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production" }), true);
  assert.equal(schedulerEnabled({ NEXT_RUNTIME: "nodejs", NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }), false);
  assert.equal(schedulerEnabled({ NEXT_RUNTIME: "nodejs", NODE_ENV: "development" }), false);
  assert.equal(schedulerEnabled({ NEXT_RUNTIME: "edge", NODE_ENV: "production" }), false);
  assert.equal(schedulerEnabled({ NEXT_RUNTIME: "nodejs", NODE_ENV: "development", TRACKING_SYNC_ENABLED: "true" }), true);
});

test("configurable daily times validate HH:mm and report the next Shanghai occurrence", () => {
  assert.equal(normalizeDailySyncTime(" 08:37 "), "08:37");
  assert.deepEqual(normalizeDailySyncTimes([" 17:00 ", "05:00", "17:00"]), ["05:00", "17:00"]);
  assert.equal(normalizeDailySyncTime("17:00, 05:00"), "05:00,17:00");
  for (const invalid of ["8:37", "24:00", "12:60", "", null, [], ["05:00", "bad"]]) {
    assert.throws(() => normalizeDailySyncTime(invalid));
  }
  assert.equal(getDueRunDate(new Date("2026-11-10T08:36:59+08:00"), "08:37"), null);
  assert.equal(getDueRunDate(new Date("2026-11-10T08:37:00+08:00"), "08:37"), "2026-11-10");
  assert.equal(nextScheduledAt(new Date("2026-11-10T08:36:59+08:00"), "08:37").toISOString(), "2026-11-10T00:37:00.000Z");
  assert.equal(nextScheduledAt(new Date("2026-11-10T08:37:00+08:00"), "08:37").toISOString(), "2026-11-10T00:37:00.000Z");
  assert.equal(nextScheduledAt(new Date("2026-11-10T10:00:00+08:00"), "08:37").toISOString(), "2026-11-10T00:37:00.000Z");
  assert.equal(nextScheduledAt(new Date("2026-11-10T08:00:00+08:00"), "08:37", "2026-11-10").toISOString(), "2026-11-11T00:37:00.000Z");

  // Multiple daily times schedule each slot in order and roll over to tomorrow's first slot after the last one.
  const multi = "05:00,17:00";
  assert.equal(getDueRunDate(new Date("2026-11-10T04:59:59+08:00"), multi), null);
  assert.equal(getDueRunDate(new Date("2026-11-10T05:00:00+08:00"), multi), "2026-11-10@05:00");
  assert.equal(getDueRunDate(new Date("2026-11-10T06:00:00+08:00"), multi, "2026-11-10@05:00"), null);
  assert.equal(nextScheduledAt(new Date("2026-11-10T06:00:00+08:00"), multi, "2026-11-10@05:00").toISOString(), "2026-11-10T09:00:00.000Z");
  assert.equal(getDueRunDate(new Date("2026-11-10T17:00:00+08:00"), multi, "2026-11-10@05:00"), "2026-11-10@17:00");
  assert.equal(nextScheduledAt(new Date("2026-11-10T18:00:00+08:00"), multi, "2026-11-10@17:00").toISOString(), "2026-11-10T21:00:00.000Z");
});
