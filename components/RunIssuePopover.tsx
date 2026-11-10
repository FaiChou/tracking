"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type Outcome = "FAILED" | "SKIPPED";
type RunItem = {
  id: number | null;
  trackingId: string;
  trackingNumber: string;
  outcome: Outcome;
  reason: string | null;
  createdAt: string;
  canRetry: boolean;
  retryUnavailableReason: string | null;
};
type RunItems = {
  runId: string;
  outcome: Outcome;
  recorded: boolean;
  legacyFallback: boolean;
  expectedCount: number;
  retryableCount: number;
  items: RunItem[];
};

type Props = {
  runId: string;
  outcome: Outcome;
  count: number;
  retryableOnly?: boolean;
  refreshKey: string;
  retryDisabled: boolean;
  retryBusy: boolean;
  retryDisabledReason?: string;
  onRetry: (runId: string, trackingId?: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRunItems(value: unknown, runId: string, outcome: Outcome): value is RunItems {
  if (!isRecord(value)) return false;
  return value.runId === runId && value.outcome === outcome
    && typeof value.recorded === "boolean" && typeof value.legacyFallback === "boolean"
    && typeof value.expectedCount === "number" && Number.isFinite(value.expectedCount)
    && typeof value.retryableCount === "number" && Number.isFinite(value.retryableCount)
    && Array.isArray(value.items) && value.items.every(item => isRecord(item)
      && (item.id === null || (typeof item.id === "number" && Number.isInteger(item.id)))
      && typeof item.trackingId === "string" && typeof item.trackingNumber === "string"
      && item.outcome === outcome && (item.reason === null || typeof item.reason === "string")
      && typeof item.createdAt === "string" && typeof item.canRetry === "boolean"
      && (item.retryUnavailableReason === null || typeof item.retryUnavailableReason === "string"));
}

function formatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
}

export default function RunIssuePopover({
  runId, outcome, count, retryableOnly = false, refreshKey, retryDisabled, retryBusy, retryDisabledReason, onRetry,
}: Props) {
  const label = retryableOnly ? "待重试" : outcome === "FAILED" ? "失败" : "跳过";
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<RunItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [readRetry, setReadRetry] = useState(0);
  const openRef = useRef(false);
  const requestRefresh = useRef<(() => void) | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedOpen = useRef(false);
  const returnFocusAfterClose = useRef(false);
  const restoringFocus = useRef(false);
  const popoverId = useId();
  const titleId = useId();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    if (pinnedOpen.current) return;
    closeTimer.current = setTimeout(() => {
      if (!contentRef.current?.contains(document.activeElement)
        && !buttonRef.current?.contains(document.activeElement)) setOpen(false);
    }, 200);
  };
  const focusPanel = () => {
    pinnedOpen.current = true;
    show();
    requestAnimationFrame(() => contentRef.current?.focus());
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let pendingRefresh = false;
    let activeRequest: AbortController | null = null;
    setDetails(null);
    setError("");

    async function loadItems() {
      if (disposed || !openRef.current) return;
      if (inFlight) {
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
        const response = await fetch(`/api/scraper/runs/${encodeURIComponent(runId)}/items?outcome=${outcome}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 404 ? "任务记录不存在" : "读取任务明细失败，请重试");
        const data: unknown = await response.json();
        if (!isRunItems(data, runId, outcome)) throw new Error("任务明细格式错误，请重试");
        if (!disposed) {
          setDetails(data);
          setError("");
        }
      } catch (cause) {
        if (!disposed) {
          setError(controller.signal.aborted ? "读取任务明细超时，请重试"
            : cause instanceof Error ? cause.message : "读取任务明细失败，请重试");
        }
      } finally {
        clearTimeout(timeout);
        activeRequest = null;
        inFlight = false;
        if (!disposed) {
          if (pendingRefresh && openRef.current) void loadItems();
          else setLoading(false);
        }
      }
    }

    requestRefresh.current = () => { void loadItems(); };
    return () => {
      disposed = true;
      requestRefresh.current = null;
      activeRequest?.abort();
    };
  }, [runId, outcome]);

  useEffect(() => {
    openRef.current = open;
    if (open) requestRefresh.current?.();
  }, [open, refreshKey, readRetry, runId, outcome]);

  const actionsDisabled = retryDisabled || retryBusy || loading || Boolean(error);
  const visibleItems = details?.items.filter(item => !retryableOnly || item.canRetry) ?? [];

  return (
    <Popover open={open} onOpenChange={value => {
      if (!value) {
        pinnedOpen.current = false;
        cancelClose();
      }
      setOpen(value);
    }}>
      <PopoverAnchor asChild>
        <Button
          ref={buttonRef} type="button" variant="ghost"
          className={`h-auto min-h-8 min-w-8 justify-start rounded-sm p-0 text-xl font-semibold tabular-nums underline decoration-dotted underline-offset-4 ${outcome === "FAILED" ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
          aria-label={`查看${label}明细，共 ${count} 条`}
          aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popoverId : undefined}
          onPointerEnter={event => { if (event.pointerType !== "touch") show(); }}
          onPointerLeave={scheduleClose}
          onFocus={() => { if (!restoringFocus.current) show(); }}
          onBlur={scheduleClose}
          onClick={focusPanel}
          onKeyDown={event => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusPanel();
            }
          }}
        >
          {count}
        </Button>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef} id={popoverId} aria-labelledby={titleId} align="start" sideOffset={8} tabIndex={0}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(30rem,calc(100vw-2rem))] flex-col p-0 text-left"
        onOpenAutoFocus={event => event.preventDefault()}
        onEscapeKeyDown={() => {
          cancelClose();
          returnFocusAfterClose.current = contentRef.current?.contains(document.activeElement) ?? false;
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (returnFocusAfterClose.current) {
            returnFocusAfterClose.current = false;
            restoringFocus.current = true;
            buttonRef.current?.focus({ preventScroll: true });
            restoringFocus.current = false;
          }
        }}
        onPointerEnter={cancelClose} onPointerLeave={scheduleClose}
        onFocusCapture={cancelClose} onBlurCapture={scheduleClose}
      >
        <div className="shrink-0 space-y-3 border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 id={titleId} className="font-semibold">{label}明细</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {retryableOnly ? `当前待重试 ${details?.retryableCount ?? count} 条`
                  : `任务汇总 ${details?.expectedCount ?? count} 条${details ? `，当前名单 ${details.items.length} 条` : ""}`}
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={() => setReadRetry(value => value + 1)} aria-label="刷新任务明细">
              {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
            </Button>
          </div>
          {outcome === "FAILED" && details && details.retryableCount > 0 && (
            <Button type="button" size="sm" disabled={actionsDisabled} onClick={() => onRetry(runId)}>
              {retryBusy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              全部重试（{details.retryableCount}）
            </Button>
          )}
          {outcome === "FAILED" && retryDisabledReason && <p className="text-xs text-muted-foreground">{retryDisabledReason}</p>}
        </div>
        <div className="min-h-0 max-h-[min(28rem,65vh)] overflow-y-auto overscroll-contain p-4" tabIndex={0} aria-label={`${label}运单名单`}>
          {error && (
            <div role="alert" className="mb-3 space-y-2 text-sm">
              <p className="text-destructive">{error}{details ? "，以下保留上次读取的明细。" : ""}</p>
              <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setReadRetry(value => value + 1)}>重试读取</Button>
            </div>
          )}
          {!details && loading && <p role="status" className="text-sm text-muted-foreground">正在读取{label}明细…</p>}
          {details && (
            <>
              {!details.recorded && (
                <p className="mb-4 rounded-md bg-muted p-3 text-xs leading-relaxed">
                  {outcome === "SKIPPED" ? "旧任务未保存跳过名单，无法还原。"
                    : details.legacyFallback ? (retryableOnly
                      ? "旧任务未保存完整明细，下列仅为目前能确认仍可重试的运单。"
                      : "旧任务未保存完整明细，下列仅为目前能确认仍失败的运单，可能少于汇总数量。")
                      : "旧任务未保存完整失败明细，无法还原。"}
                </p>
              )}
              {visibleItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {retryableOnly ? "当前没有可重试的失败运单" : details.recorded ? `暂无${label}运单` : "暂无可展示的运单明细"}
                </p>
              ) : (
                <ul className="space-y-4">
                  {visibleItems.map(item => (
                    <li key={item.id ?? item.trackingId} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-all text-sm font-medium">{item.trackingNumber}</p>
                        {outcome === "FAILED" && (
                          <Button type="button" size="sm" variant="outline" disabled={actionsDisabled || !item.canRetry} onClick={() => onRetry(runId, item.trackingId)}>
                            重试此单
                          </Button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.reason || "未记录原因"}</p>
                      {outcome === "FAILED" && !item.canRetry && (
                        <p className="text-xs text-muted-foreground">{item.retryUnavailableReason || "当前不可重试"}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatTime(item.createdAt)}（北京时间）</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
