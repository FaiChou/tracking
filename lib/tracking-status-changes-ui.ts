export type TrackingStatus = "PENDING" | "TRANSIT" | "DELIVERED" | "EXCEPTION";
export type ChangeSource = "SCHEDULED_SCRAPE" | "MANUAL_SCRAPE" | "MANUAL_EDIT";

export type StatusChange = {
  id: number;
  trackingId: string;
  trackingNumber: string;
  fromStatus: TrackingStatus;
  toStatus: TrackingStatus;
  source: ChangeSource;
  syncRunId: string | null;
  createdAt: string;
};

export const STATUS_LABELS: Record<TrackingStatus, string> = {
  PENDING: "待处理",
  TRANSIT: "运输中",
  DELIVERED: "已签收",
  EXCEPTION: "异常",
};

export const STATUS_COLORS: Record<TrackingStatus, string> = {
  PENDING: "text-muted-foreground",
  TRANSIT: "text-blue-600 dark:text-blue-400",
  DELIVERED: "text-green-600 dark:text-green-400",
  EXCEPTION: "text-red-600 dark:text-red-400",
};

export const SOURCE_LABELS: Record<ChangeSource, string> = {
  SCHEDULED_SCRAPE: "scraper",
  MANUAL_SCRAPE: "scraper",
  MANUAL_EDIT: "手动修改",
};

export const SOURCE_BADGE_STYLES: Record<ChangeSource, string> = {
  SCHEDULED_SCRAPE: "bg-violet-50 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  MANUAL_SCRAPE: "bg-violet-50 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  MANUAL_EDIT: "bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
};

export const STATUS_BADGE_STYLES: Record<TrackingStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/30",
  TRANSIT: "bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/30",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  EXCEPTION: "bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/30",
};

export const STATUS_DOT_COLORS: Record<TrackingStatus, string> = {
  PENDING: "bg-slate-500 dark:bg-slate-400",
  TRANSIT: "bg-blue-500 dark:bg-blue-400",
  DELIVERED: "bg-emerald-500 dark:bg-emerald-400",
  EXCEPTION: "bg-red-500 dark:bg-red-400",
};

export function isStatusChange(value: unknown): value is StatusChange {
  if (value === null || typeof value !== "object") return false;
  const log = value as Record<string, unknown>;
  return typeof log.id === "number" && Number.isInteger(log.id)
    && typeof log.trackingId === "string" && typeof log.trackingNumber === "string"
    && typeof log.fromStatus === "string" && Object.hasOwn(STATUS_LABELS, log.fromStatus)
    && typeof log.toStatus === "string" && Object.hasOwn(STATUS_LABELS, log.toStatus)
    && typeof log.source === "string" && Object.hasOwn(SOURCE_LABELS, log.source)
    && (log.syncRunId === null || typeof log.syncRunId === "string")
    && typeof log.createdAt === "string";
}

export function formatStatusChangeTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
