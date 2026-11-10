export const TRACKING_TIME_ZONE = "Asia/Shanghai";
export const DEFAULT_DAILY_SYNC_TIME = "05:00";

const localClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRACKING_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function normalizeDailySyncTime(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    throw new Error("每日抓取时间须为 HH:mm 格式（00:00–23:59）");
  }
  return value.trim();
}

function clockParts(now: Date) {
  const parts = Object.fromEntries(localClock.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** A restart after the configured Shanghai time catches up today's unfinished run. */
export function getDueRunDate(now: Date, time = DEFAULT_DAILY_SYNC_TIME): string | null {
  const parts = clockParts(now);
  return parts.time >= normalizeDailySyncTime(time) ? parts.date : null;
}

export function runDateStart(runDate: string, time = DEFAULT_DAILY_SYNC_TIME): Date {
  return new Date(`${runDate}T${normalizeDailySyncTime(time)}:00+08:00`);
}

export function nextScheduledAt(now: Date, time = DEFAULT_DAILY_SYNC_TIME, lastRunDate?: string | null): Date {
  const date = clockParts(now).date;
  const scheduled = runDateStart(date, time);
  // An overdue, unfinished run is still due today; the scheduler catches it up on its next tick.
  return lastRunDate !== date ? scheduled : new Date(scheduled.getTime() + 24 * 60 * 60_000);
}

export function schedulerEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.NEXT_RUNTIME !== "nodejs" || env.NEXT_PHASE === "phase-production-build") return false;
  if (env.TRACKING_SYNC_ENABLED === "false") return false;
  return env.NODE_ENV === "production" || env.TRACKING_SYNC_ENABLED === "true";
}
