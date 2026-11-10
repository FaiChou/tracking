"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import ScraperSettings from "@/components/ScraperSettings";
import TrackingStatusChanges from "@/components/TrackingStatusChanges";
import RunIssuePopover from "@/components/RunIssuePopover";
import { Button } from "@/components/ui/button";

type RunStatus = "RUNNING" | "STOPPING" | "COMPLETED" | "STOPPED" | "FAILED" | "INTERRUPTED";
type Run = {
  id: string;
  trigger: "manual" | "scheduled" | "retry";
  retryOfRunId: string | null;
  hasDetails: boolean;
  status: RunStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  currentTrackingNumber: string | null;
  stopRequested: boolean;
  error: string | null;
};
type ScraperStatus = {
  activeRun: Run | null;
  lastRun: Run | null;
  retrySourceRun: Run | null;
  schedulerEnabled: boolean;
  timeZone: "Asia/Shanghai";
  nextScheduledAt: string | null;
  serverTime: string;
};

const RUN_LABELS: Record<RunStatus, string> = {
  RUNNING: "正在抓取", STOPPING: "正在停止", COMPLETED: "已完成",
  STOPPED: "已停止", FAILED: "任务失败", INTERRUPTED: "任务中断",
};
const TRIGGER_LABELS: Record<Run["trigger"], string> = {
  manual: "手动抓取", scheduled: "定时抓取", retry: "失败重试",
};

type RetryControls = {
  retryDisabled: boolean;
  retryBusy: boolean;
  retryDisabledReason?: string;
  refreshKey: string;
  onRetry: (runId: string, trackingId?: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRun(value: unknown): value is Run {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.status === "string" && Object.hasOwn(RUN_LABELS, value.status)
    && (value.trigger === "manual" || value.trigger === "scheduled" || value.trigger === "retry")
    && (value.retryOfRunId === null || typeof value.retryOfRunId === "string") && typeof value.hasDetails === "boolean"
    && ["total", "processed", "succeeded", "failed", "skipped"].every(key => typeof value[key] === "number" && Number.isFinite(value[key]))
    && typeof value.startedAt === "string" && (value.finishedAt === null || typeof value.finishedAt === "string")
    && (value.durationMs === null || (typeof value.durationMs === "number" && Number.isFinite(value.durationMs)))
    && (value.currentTrackingNumber === null || typeof value.currentTrackingNumber === "string")
    && typeof value.stopRequested === "boolean" && (value.error === null || typeof value.error === "string");
}

function isScraperStatus(value: unknown): value is ScraperStatus {
  return isRecord(value) && (value.activeRun === null || isRun(value.activeRun))
    && (value.lastRun === null || isRun(value.lastRun))
    && (value.retrySourceRun === null || isRun(value.retrySourceRun))
    && typeof value.schedulerEnabled === "boolean" && value.timeZone === "Asia/Shanghai"
    && (value.nextScheduledAt === null || typeof value.nextScheduledAt === "string")
    && typeof value.serverTime === "string";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
}

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null) return "—";
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours ? `${hours}小时 ` : ""}${minutes ? `${minutes}分 ` : ""}${seconds}秒`;
}

function RunDetails({ run, active, ...retryControls }: { run: Run; active: boolean } & RetryControls) {
  const stats = [
    { label: "处理进度", value: `${run.processed} / ${run.total}` },
    { label: "成功", value: run.succeeded },
    { label: "失败", value: <RunIssuePopover key={`${run.id}:FAILED`} runId={run.id} outcome="FAILED" count={run.failed} {...retryControls} /> },
    { label: "跳过", value: <RunIssuePopover key={`${run.id}:SKIPPED`} runId={run.id} outcome="SKIPPED" count={run.skipped} {...retryControls} /> },
    { label: "耗时", value: formatDuration(run.durationMs) },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">{active ? "本次任务" : "上次任务"}</h3>
        <p className="text-sm text-muted-foreground">
          {TRIGGER_LABELS[run.trigger]} · {RUN_LABELS[run.status]}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        {stats.map(stat => (
          <div key={stat.label} className="space-y-1">
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {run.total > 0 && (
        <div
          role="progressbar" aria-label={active ? "本次任务进度" : "上次任务进度"}
          aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={Math.min(run.processed, run.total)}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.min(100, run.processed / run.total * 100)}%` }} />
        </div>
      )}
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {active && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">当前运单</dt>
            <dd className="mt-1 break-all font-mono">{run.currentTrackingNumber || "—"}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted-foreground">开始时间（北京时间）</dt>
          <dd className="mt-1 tabular-nums">{formatDate(run.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">结束时间（北京时间）</dt>
          <dd className="mt-1 tabular-nums">{formatDate(run.finishedAt)}</dd>
        </div>
      </dl>
      {run.error && <p className="break-words rounded-md bg-destructive/5 p-3 text-sm text-destructive">{run.error}</p>}
    </div>
  );
}

export default function ScraperPage() {
  const [status, setStatus] = useState<ScraperStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [action, setAction] = useState<"start" | "stop" | "retry" | null>(null);
  const [actionError, setActionError] = useState("");
  const actionLock = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeRequest: AbortController | null = null;
    setStatusLoading(true);

    async function poll() {
      const controller = new AbortController();
      activeRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch("/api/scraper/status", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("读取任务状态失败");
        const data: unknown = await response.json();
        if (!isScraperStatus(data)) throw new Error("任务状态数据格式错误");
        if (!cancelled) {
          setStatus(data);
          setStatusError("");
        }
      } catch (cause) {
        if (!cancelled) {
          setStatusError(controller.signal.aborted ? "读取任务状态超时" : cause instanceof Error ? cause.message : "读取任务状态失败");
        }
      } finally {
        clearTimeout(timeout);
        activeRequest = null;
        if (!cancelled) {
          setStatusLoading(false);
          timer = setTimeout(() => void poll(), 2_000);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      activeRequest?.abort();
    };
  }, [refreshKey]);

  async function runAction(kind: "start" | "stop" | "retry", retry?: { runId: string; trackingId?: string }) {
    if (actionLock.current || !status || statusError || statusLoading) return;
    if (kind === "stop" ? !status.activeRun : status.activeRun) return;
    if (kind === "retry" && !retry) return;
    actionLock.current = true;
    setAction(kind);
    setActionError("");
    try {
      const response = await fetch(`/api/scraper/${kind}`, {
        method: "POST",
        ...(kind === "stop" || kind === "retry" ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(kind === "retry" ? retry : { runId: status.activeRun!.id }),
        } : {}),
      });
      const data: unknown = await response.json();
      const message = isRecord(data) && typeof data.message === "string" ? data.message : null;
      if (response.status === 409) {
        toast.info(message || "已有任务正在运行");
      } else if (!response.ok) {
        throw new Error(message || (kind === "start" ? "启动抓取失败" : kind === "retry" ? "启动失败重试任务失败" : "停止抓取失败"));
      } else {
        toast.success(kind === "start" ? "抓取任务已启动" : kind === "retry" ? "失败重试任务已启动" : "已请求停止抓取");
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "操作失败，请重试");
    } finally {
      actionLock.current = false;
      setAction(null);
      setStatusLoading(true);
      setRefreshKey(value => value + 1);
    }
  }

  const activeRun = status?.activeRun ?? null;
  const displayedRun = activeRun ?? status?.lastRun ?? null;
  const stopping = activeRun?.status === "STOPPING" || activeRun?.stopRequested;
  const actionsDisabled = !status || Boolean(statusError) || action !== null || statusLoading;
  const scheduledRunDue = Boolean(status?.nextScheduledAt
    && new Date(status.nextScheduledAt).getTime() <= new Date(status.serverTime).getTime());
  const retryControls: RetryControls = {
    retryDisabled: actionsDisabled || Boolean(activeRun),
    retryBusy: action === "retry",
    retryDisabledReason: statusError ? "任务状态未确认，恢复后可重试。"
      : activeRun ? "当前任务结束后可重试失败运单。"
        : action ? "正在处理请求，请稍候。" : statusLoading ? "正在刷新任务状态…" : undefined,
    refreshKey: `${activeRun?.id ?? ""}:${activeRun?.processed ?? ""}:${status?.lastRun?.id ?? ""}:${status?.lastRun?.status ?? ""}:${refreshKey}`,
    onRetry: (runId, trackingId) => { void runAction("retry", { runId, trackingId }); },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ScraperSettings onSaved={() => setRefreshKey(value => value + 1)} />

      <section aria-labelledby="scraper-task-title" className="rounded-lg border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="scraper-task-title" className="text-lg font-semibold">抓取任务</h2>
              <span role="status" className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {statusError ? "状态未确认" : !status ? "读取中…" : activeRun ? RUN_LABELS[stopping ? "STOPPING" : activeRun.status] : "当前空闲"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void runAction("start")} disabled={actionsDisabled || Boolean(activeRun)}>
              {action === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {action === "start" ? "启动中…" : "立即抓取"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void runAction("stop")} disabled={actionsDisabled || !activeRun || Boolean(stopping)}>
              {action === "stop" || stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              {action === "stop" || stopping ? "停止中…" : "停止抓取"}
            </Button>
          </div>
        </div>

        {statusError && (
          <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="space-y-1 text-sm">
              <p className="text-destructive">{statusError}，正在自动重试。</p>
              {status && <p className="text-muted-foreground">以下为 {formatDate(status.serverTime)} 的状态，当前进度尚未确认。</p>}
            </div>
            <Button type="button" variant="outline" size="sm" disabled={statusLoading} onClick={() => setRefreshKey(value => value + 1)}>重试读取状态</Button>
          </div>
        )}
        {actionError && <p role="alert" className="mt-4 text-sm text-destructive">{actionError}</p>}

        {status && !statusError && (
          <p className="mt-4 text-sm text-muted-foreground">
            {status.schedulerEnabled
              ? scheduledRunDue
                ? activeRun && activeRun.trigger !== "scheduled"
                  ? "已到计划时间，将在当前任务结束后自动抓取"
                  : "已到计划时间，将自动开始抓取"
                : `下次自动抓取：${status.nextScheduledAt ? `${formatDate(status.nextScheduledAt)}（北京时间）` : "等待调度"}`
              : "当前环境未启用自动任务，仍可手动抓取。"}
          </p>
        )}
        {stopping && !statusError && <p className="mt-3 text-sm text-muted-foreground">正在结束本次任务，已保存的查询结果会保留。</p>}

        <div className="mt-5 border-t pt-5">
          {displayedRun ? <RunDetails run={displayedRun} active={Boolean(activeRun)} {...retryControls} /> : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {!status ? (statusError ? "暂时无法读取任务记录。" : "正在读取任务记录…") : "暂无抓取记录，可立即开始一次抓取。"}
            </p>
          )}
        </div>
        {displayedRun?.retryOfRunId && (
          <div className="mt-5 border-t pt-5">
            {status?.retrySourceRun ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-medium">重试来源任务</h3>
                  <p className="text-sm text-muted-foreground">{formatDate(status.retrySourceRun.startedAt)}（北京时间） · {TRIGGER_LABELS[status.retrySourceRun.trigger]}</p>
                  <p className="text-xs text-muted-foreground">原任务失败数保留，可在名单中查看并重试尚未解决的运单。</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">原任务失败</p>
                  <RunIssuePopover
                    key={`${status.retrySourceRun.id}:source-failures`}
                    runId={status.retrySourceRun.id} outcome="FAILED" count={status.retrySourceRun.failed}
                    {...retryControls}
                  />
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">暂时无法读取重试来源任务。</p>}
          </div>
        )}
      </section>
      <TrackingStatusChanges refreshKey={`${activeRun?.id ?? ""}:${activeRun?.processed ?? ""}:${status?.lastRun?.id ?? ""}`} />
    </div>
  );
}
