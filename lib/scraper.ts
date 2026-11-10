import { createHash } from "node:crypto";
import type { TrackingStatus } from "@prisma/client";
import { newestEventsFirst } from "@/lib/tracking-history";

export const SCRAPER_TIMEOUT_MS = 180_000;
export const SCRAPER_BUDGET_MS = 120_000;

export type ScraperEvent = {
  eventKey: string;
  occurredAt: Date | null;
  timeText: string | null;
  description: string;
  stage: string | null;
  location: string | null;
  tieOrder: number;
};

export type ScraperResult = {
  status: TrackingStatus | null;
  events: ScraperEvent[];
};

const STAGE_STATUS: Record<string, TrackingStatus> = {
  pending: "PENDING",
  registered: "PENDING",
  accepted: "TRANSIT",
  in_transit: "TRANSIT",
  out_for_delivery: "TRANSIT",
  customs: "TRANSIT",
  ready_for_pickup: "TRANSIT",
  delivered: "DELIVERED",
  failed_attempt: "EXCEPTION",
  returned: "EXCEPTION",
  exception: "EXCEPTION",
};

export function mapScraperStage(stage: unknown): TrackingStatus | null {
  return typeof stage === "string" ? STAGE_STATUS[stage.trim().toLowerCase()] ?? null : null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Unknown carrier-local clocks are retained as text, never assigned the host's timezone.
function instant(value: unknown): Date | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizeEvent(value: unknown): ScraperEvent | null {
  const event = object(value);
  if (!event) return null;
  const stage = text(event.stage);
  const description = text(event.description);
  if (!description && !stage) return null;
  const timeText = text(event.time) ?? text(event.instant);
  const occurredAt = instant(event.instant) ?? instant(event.time);
  const location = text(event.location);
  const tieOrder = typeof event.tie_order === "number" && Number.isInteger(event.tie_order)
    && event.tie_order >= 0 ? event.tie_order : 0;
  const eventKey = createHash("sha256")
    .update(JSON.stringify([occurredAt?.toISOString() ?? timeText, description, stage, location]))
    .digest("hex");
  return {
    eventKey, occurredAt, timeText, description: description ?? "物流状态更新", stage, location, tieOrder,
  };
}

/** The HTTP API wraps the carrier answer in { carrier, source, result, attempts }. */
export function parseScraperResponse(payload: unknown): ScraperResult {
  const response = object(payload);
  const result = object(response?.result);
  if (!result || (result.events !== undefined && !Array.isArray(result.events))) {
    throw new Error("Scraper 返回了无效的物流数据");
  }
  const events = ((result.events ?? []) as unknown[])
    .map(normalizeEvent).filter((event): event is ScraperEvent => event !== null);
  const currentStage = text(result.current_stage) ?? newestEventsFirst(events)[0]?.stage ?? null;
  const status = mapScraperStage(currentStage);

  // Some carriers expose a status summary without individual scans.
  if (events.length === 0 && text(result.last_status_text)) {
    const summary = normalizeEvent({
      time: result.last_update,
      description: result.last_status_text,
      stage: currentStage,
    });
    if (summary) events.push(summary);
  }
  if (!currentStage && events.length === 0) {
    throw new Error("Scraper 未返回物流轨迹或有效状态");
  }
  return {
    status,
    events: [...new Map(events.map(event => [event.eventKey, event])).values()],
  };
}

// A display name is not generally a scraper carrier ID. Let its detection handle unknown names.
export function scraperCarrier(name: string | null | undefined): string | undefined {
  const normalized = name?.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const names: Record<string, string> = {
    fedex: "fedex", 联邦快递: "fedex", usps: "usps", 美国邮政: "usps",
    ups: "ups", ems: "ems", dhl: "dhl",
  };
  return normalized ? names[normalized] : undefined;
}

export class ScraperHttpError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly retryAfterMs: number) {
    super(message);
    this.name = "ScraperHttpError";
  }
}

export async function fetchParcel(
  baseUrl: string,
  tracking: { trackingNumber: string; logisticsCompany: { name: string } | null },
  options: { signal?: AbortSignal; fetch?: typeof fetch } = {},
): Promise<ScraperResult> {
  const timeout = AbortSignal.timeout(SCRAPER_TIMEOUT_MS);
  const response = await (options.fetch ?? fetch)(`${baseUrl.replace(/\/+$/, "")}/v1/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      number: tracking.trackingNumber,
      carrier: scraperCarrier(tracking.logisticsCompany?.name),
      budgetMs: SCRAPER_BUDGET_MS,
    }),
    cache: "no-store",
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = text(object(payload)?.error);
    const retryHeader = response.headers.get("retry-after");
    const retryAfterMs = retryHeader && /^\d+$/.test(retryHeader)
      ? Number(retryHeader) * 1000
      : retryHeader ? Math.max(0, Date.parse(retryHeader) - Date.now()) : 0;
    throw new ScraperHttpError(
      `Scraper 查询失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 300)}` : ""}`,
      response.status,
      Number.isFinite(retryAfterMs) ? retryAfterMs : 0,
    );
  }
  return parseScraperResponse(await response.json());
}
