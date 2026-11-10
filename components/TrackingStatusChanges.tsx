"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type TrackingStatus = "PENDING" | "TRANSIT" | "DELIVERED" | "EXCEPTION";
type ChangeSource = "SCHEDULED_SCRAPE" | "MANUAL_SCRAPE" | "MANUAL_EDIT";
type StatusChange = {
  id: number;
  trackingId: string;
  trackingNumber: string;
  fromStatus: TrackingStatus;
  toStatus: TrackingStatus;
  source: ChangeSource;
  syncRunId: string | null;
  createdAt: string;
};

const STATUS_LABELS: Record<TrackingStatus, string> = {
  PENDING: "待处理", TRANSIT: "运输中", DELIVERED: "已签收", EXCEPTION: "异常",
};
const STATUS_COLORS: Record<TrackingStatus, string> = {
  PENDING: "text-muted-foreground", TRANSIT: "text-blue-600 dark:text-blue-400",
  DELIVERED: "text-green-600 dark:text-green-400", EXCEPTION: "text-red-600 dark:text-red-400",
};
const SOURCE_LABELS: Record<ChangeSource, string> = {
  SCHEDULED_SCRAPE: "定时抓取", MANUAL_SCRAPE: "立即抓取", MANUAL_EDIT: "手动修改",
};
const LOG_LIMIT = 500;

function isStatusChange(value: unknown): value is StatusChange {
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

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
}

export default function TrackingStatusChanges({ refreshKey }: { refreshKey?: string }) {
  const [logs, setLogs] = useState<StatusChange[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);
  const requestRefresh = useRef<(() => void) | null>(null);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let pendingRefresh = false;
    let activeRequest: AbortController | null = null;

    async function loadLogs() {
      if (disposed) return;
      if (inFlight) {
        // Coalesce progress updates without cancelling a slower in-flight read.
        pendingRefresh = true;
        return;
      }
      inFlight = true;
      pendingRefresh = false;
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      setLoading(true);
      try {
        const response = await fetch("/api/trackings/status-changes", {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("读取状态变更记录失败，请重试");
        const data: unknown = await response.json();
        if (data === null || typeof data !== "object" || !("logs" in data)
          || !Array.isArray(data.logs) || !data.logs.every(isStatusChange)
          || !("limit" in data) || data.limit !== LOG_LIMIT) {
          throw new Error("状态变更记录格式错误，请重试");
        }
        if (!disposed) {
          setLogs(data.logs);
          setError("");
        }
      } catch (cause) {
        if (!disposed) {
          setError(controller.signal.aborted ? "读取状态变更记录超时，请重试"
            : cause instanceof Error ? cause.message : "读取状态变更记录失败，请重试");
        }
      } finally {
        clearTimeout(timeout);
        activeRequest = null;
        inFlight = false;
        if (!disposed) {
          if (pendingRefresh) void loadLogs();
          else setLoading(false);
        }
      }
    }

    requestRefresh.current = () => { void loadLogs(); };
    return () => {
      disposed = true;
      requestRefresh.current = null;
      activeRequest?.abort();
    };
  }, []);

  useEffect(() => {
    requestRefresh.current?.();
  }, [refreshKey, refreshCount]);

  return (
    <section aria-labelledby="tracking-status-changes-title" className="rounded-lg border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 id="tracking-status-changes-title" className="text-lg font-semibold">最近状态变更</h2>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => setRefreshCount(value => value + 1)}>
          {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
          {loading ? "读取中…" : error ? "重试" : "刷新"}
        </Button>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}。{Boolean(logs?.length) && "以下保留上次加载的记录。"}
        </div>
      )}

      {logs === null ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          {loading ? "正在读取状态变更记录…" : "暂时无法读取状态变更记录。"}
        </p>
      ) : logs.length === 0 ? (
        !error && <p className="py-8 text-center text-sm text-muted-foreground">暂无状态变更记录</p>
      ) : (
        <>
          <div className="mt-5 max-h-[28rem] overflow-y-auto rounded-md border" tabIndex={0} role="region" aria-label="最近状态变更列表">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间（北京时间）</TableHead>
                  <TableHead>运单号</TableHead>
                  <TableHead>状态变更</TableHead>
                  <TableHead>来源</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="tabular-nums text-muted-foreground">
                      <time dateTime={log.createdAt}>{formatTimestamp(log.createdAt)}</time>
                    </TableCell>
                    <TableCell className="font-medium">{log.trackingNumber}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className={STATUS_COLORS[log.fromStatus]}>{STATUS_LABELS[log.fromStatus]}</span>
                        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="sr-only">变为</span>
                        <span className={STATUS_COLORS[log.toStatus]}>{STATUS_LABELS[log.toStatus]}</span>
                      </span>
                    </TableCell>
                    <TableCell>{SOURCE_LABELS[log.source]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-right text-xs text-muted-foreground">已显示 {logs.length} 条记录</p>
        </>
      )}
    </section>
  );
}
