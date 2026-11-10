import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScraperUrl } from "../lib/scraper-url";
import { newestEventsFirst } from "../lib/tracking-history";

test("scraper addresses accept LAN hosts, protocols and reverse proxy paths", () => {
  assert.equal(normalizeScraperUrl(" 127.0.0.1:18080 "), "http://127.0.0.1:18080");
  assert.equal(normalizeScraperUrl("https://scraper.lan/service/"), "https://scraper.lan/service");
  assert.equal(normalizeScraperUrl("http://[::1]:18080"), "http://[::1]:18080");
});

test("invalid scraper addresses cannot replace saved configuration", () => {
  for (const value of [null, {}, "", "localhost:bad", "file:///tmp/scraper", "https://user:secret@host", "http://host?q=1", "http://host#fragment"]) {
    assert.throws(() => normalizeScraperUrl(value));
  }
});

test("history sorts newest first including carrier local times and same-time tie order", () => {
  const events = [
    { id: "old", occurredAt: "2026-11-08T01:00:00Z", timeText: null, tieOrder: 0 },
    { id: "unknown", occurredAt: null, timeText: "unknown", tieOrder: 0 },
    { id: "new", occurredAt: null, timeText: "2026-11-10T09:00:00", tieOrder: 0 },
    { id: "newer-tie", occurredAt: null, timeText: "2026-11-10T09:00:00", tieOrder: 1 },
    { id: "middle", occurredAt: new Date("2026-11-09T01:00:00Z"), timeText: null, tieOrder: 0 },
  ];
  assert.deepEqual(newestEventsFirst(events).map(event => event.id), ["newer-tie", "new", "middle", "old", "unknown"]);
  assert.equal(events[0].id, "old");
});
