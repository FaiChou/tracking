export const TRACKING_TIME_ZONE = "Asia/Shanghai";
export const DEFAULT_DAILY_SYNC_TIME = "05:00";
export const DEFAULT_DAILY_SYNC_TIMES = [DEFAULT_DAILY_SYNC_TIME] as const;

const localClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRACKING_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function validateSingleSyncTime(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    throw new Error("每日抓取时间须为 HH:mm 格式（00:00–23:59）");
  }
  return value.trim();
}

export function normalizeDailySyncTimes(value: unknown): string[] {
  let rawItems: unknown[];
  if (typeof value === "string") {
    if (!value.trim()) {
      throw new Error("每日抓取时间须为 HH:mm 格式（00:00–23:59）");
    }
    rawItems = value.split(",");
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error("请至少设置一个每日抓取时间");
    }
    rawItems = value;
  } else {
    throw new Error("每日抓取时间须为 HH:mm 格式（00:00–23:59）");
  }

  const normalized = rawItems.map(validateSingleSyncTime);
  return [...new Set(normalized)].sort();
}

export function normalizeDailySyncTime(value: unknown): string {
  return normalizeDailySyncTimes(value).join(",");
}

function clockParts(now: Date) {
  const parts = Object.fromEntries(localClock.formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function isRunDateHandled(
  date: string,
  slotTime: string,
  times: readonly string[],
  lastRunDate?: string | null,
): boolean {
  if (!lastRunDate) return false;
  const [lastDate, lastTime] = lastRunDate.split("@");
  if (lastDate !== date) return false;
  if (times.length === 1 && !lastTime) return true;
  const handledThrough = lastTime ?? times[0];
  return slotTime <= handledThrough;
}

/** A restart after the configured Shanghai time catches up today's unfinished run. */
export function getDueRunDate(
  now: Date,
  time: string | readonly string[] = DEFAULT_DAILY_SYNC_TIME,
  lastRunDate?: string | null,
): string | null {
  const times = normalizeDailySyncTimes(time);
  const parts = clockParts(now);
  const dueTimes = times.filter(candidate => candidate <= parts.time);
  if (dueTimes.length === 0) return null;
  const latestDue = dueTimes[dueTimes.length - 1];
  if (isRunDateHandled(parts.date, latestDue, times, lastRunDate)) return null;
  return times.length === 1 ? parts.date : `${parts.date}@${latestDue}`;
}

export function runDateStart(runDate: string, time: string | readonly string[] = DEFAULT_DAILY_SYNC_TIME): Date {
  const [datePart, slotPart] = runDate.split("@");
  if (slotPart) {
    return new Date(`${datePart}T${validateSingleSyncTime(slotPart)}:00+08:00`);
  }
  const times = normalizeDailySyncTimes(time);
  return new Date(`${datePart}T${times[0]}:00+08:00`);
}

export function nextScheduledAt(
  now: Date,
  time: string | readonly string[] = DEFAULT_DAILY_SYNC_TIME,
  lastRunDate?: string | null,
): Date {
  const times = normalizeDailySyncTimes(time);
  const parts = clockParts(now);
  const dueTimes = times.filter(candidate => candidate <= parts.time);
  if (dueTimes.length > 0) {
    const latestDue = dueTimes[dueTimes.length - 1];
    // An overdue, unfinished run is still due today; the scheduler catches it up on its next tick.
    if (!isRunDateHandled(parts.date, latestDue, times, lastRunDate)) {
      return new Date(`${parts.date}T${latestDue}:00+08:00`);
    }
  }
  const nextToday = times.find(
    candidate => candidate > parts.time && !isRunDateHandled(parts.date, candidate, times, lastRunDate),
  );
  if (nextToday) {
    return new Date(`${parts.date}T${nextToday}:00+08:00`);
  }
  const firstToday = new Date(`${parts.date}T${times[0]}:00+08:00`);
  return new Date(firstToday.getTime() + 24 * 60 * 60_000);
}

export function schedulerEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.NEXT_RUNTIME !== "nodejs" || env.NEXT_PHASE === "phase-production-build") return false;
  if (env.TRACKING_SYNC_ENABLED === "false") return false;
  return env.NODE_ENV === "production" || env.TRACKING_SYNC_ENABLED === "true";
}
