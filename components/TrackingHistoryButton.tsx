"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, RefreshCw } from "lucide-react";
import type { TrackingStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type TrackingEvent = {
  id: string;
  occurredAt: string | null;
  timeText: string | null;
  description: string;
  stage: string | null;
  location: string | null;
};

type TrackingHistory = {
  events: TrackingEvent[];
  lastSyncedAt: string | null;
  lastSyncAttemptAt: string | null;
  lastSyncError: string | null;
};

type SingleSyncResponse = TrackingHistory & {
  status: TrackingStatus;
  previousStatus: TrackingStatus;
  statusChanged: boolean;
};

const STAGE_STYLES: Record<string, { label: string; badge: string; dot: string }> = {
  pending: {
    label: "待处理",
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/30",
    dot: "bg-slate-500 dark:bg-slate-400",
  },
  registered: {
    label: "已登记",
    badge: "bg-indigo-50 text-indigo-700 ring-indigo-500/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/30",
    dot: "bg-indigo-500 dark:bg-indigo-400",
  },
  accepted: {
    label: "已揽收",
    badge: "bg-teal-50 text-teal-700 ring-teal-500/20 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/30",
    dot: "bg-teal-500 dark:bg-teal-400",
  },
  pre_transit: {
    label: "待揽收",
    badge: "bg-lime-50 text-lime-800 ring-lime-500/20 dark:bg-lime-400/10 dark:text-lime-300 dark:ring-lime-400/30",
    dot: "bg-lime-500 dark:bg-lime-400",
  },
  info_received: {
    label: "已收到物流信息",
    badge: "bg-sky-50 text-sky-700 ring-sky-500/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/30",
    dot: "bg-sky-500 dark:bg-sky-400",
  },
  in_transit: {
    label: "运输中",
    badge: "bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/30",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  customs: {
    label: "清关中",
    badge: "bg-purple-50 text-purple-700 ring-purple-500/20 dark:bg-purple-400/10 dark:text-purple-300 dark:ring-purple-400/30",
    dot: "bg-purple-500 dark:bg-purple-400",
  },
  out_for_delivery: {
    label: "派送中",
    badge: "bg-orange-50 text-orange-700 ring-orange-500/20 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/30",
    dot: "bg-orange-500 dark:bg-orange-400",
  },
  ready_for_pickup: {
    label: "待取件",
    badge: "bg-amber-50 text-amber-800 ring-amber-500/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  delivered: {
    label: "已签收",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/30",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
  exception: {
    label: "异常",
    badge: "bg-red-50 text-red-700 ring-red-500/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/30",
    dot: "bg-red-500 dark:bg-red-400",
  },
  failed_attempt: {
    label: "投递未成功",
    badge: "bg-rose-50 text-rose-700 ring-rose-500/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/30",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
  returned: {
    label: "已退回",
    badge: "bg-pink-50 text-pink-700 ring-pink-500/20 dark:bg-pink-400/10 dark:text-pink-300 dark:ring-pink-400/30",
    dot: "bg-pink-500 dark:bg-pink-400",
  },
  return_to_sender: {
    label: "退回寄件人",
    badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-500/20 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/30",
    dot: "bg-fuchsia-500 dark:bg-fuchsia-400",
  },
  cancelled: {
    label: "已取消",
    badge: "bg-stone-100 text-stone-700 ring-stone-500/20 dark:bg-stone-400/10 dark:text-stone-300 dark:ring-stone-400/30",
    dot: "bg-stone-500 dark:bg-stone-400",
  },
  unknown: {
    label: "未知状态",
    badge: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-400/10 dark:text-zinc-300 dark:ring-zinc-400/30",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
};

// Equivalent carrier stage names share the same label and color.
const STAGE_ALIASES: Record<string, string> = {
  information_received: "info_received",
  picked_up: "accepted",
  transit: "in_transit",
  available_for_pickup: "ready_for_pickup",
};

function stageStyle(stage: string | null) {
  const name = stage?.trim().toLowerCase() || "unknown";
  const key = Object.hasOwn(STAGE_ALIASES, name) ? STAGE_ALIASES[name] : name;
  return Object.hasOwn(STAGE_STYLES, key)
    ? STAGE_STYLES[key]
    : { ...STAGE_STYLES.unknown, label: stage?.trim() || STAGE_STYLES.unknown.label };
}

function formatTime(value: string | null) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export default function TrackingHistoryButton({
  trackingId,
  trackingNumber,
  trackingUrl,
  onSynced,
}: {
  trackingId: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  onSynced?: (result: { status: TrackingStatus; statusChanged: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<TrackingHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusAfterClose = useRef(false);
  const restoringFocus = useRef(false);
  const syncingRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);
  const loadedAt = useRef(0);
  const popoverId = useId();
  const titleId = useId();

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const showHistory = () => {
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    if (syncingRef.current) return;
    closeTimer.current = setTimeout(() => {
      if (!syncingRef.current && !contentRef.current?.contains(document.activeElement)) setOpen(false);
    }, 200);
  };

  const handleManualSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    loadControllerRef.current?.abort();
    setIsLoading(false);
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch(`/api/trackings/${encodeURIComponent(trackingId)}/history`, {
        method: "POST",
        cache: "no-store",
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data !== null && typeof data === "object" && "message" in data && typeof data.message === "string"
          ? data.message
          : "手动抓取失败，请重试";
        throw new Error(message);
      }
      const syncResult = data as SingleSyncResponse;
      setHistory({
        events: syncResult.events,
        lastSyncedAt: syncResult.lastSyncedAt,
        lastSyncAttemptAt: syncResult.lastSyncAttemptAt,
        lastSyncError: syncResult.lastSyncError,
      });
      loadedAt.current = Date.now();
      onSynced?.({ status: syncResult.status, statusChanged: syncResult.statusChanged });
      toast.success(syncResult.statusChanged ? "抓取完成，已更新物流轨迹与状态" : "抓取完成，已更新物流轨迹");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "手动抓取失败，请重试";
      toast.error(message);
      setHistory(current => {
        if (!current) {
          setError(message);
          return null;
        }
        return {
          ...current,
          lastSyncError: message,
          lastSyncAttemptAt: new Date().toISOString(),
        };
      });
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open || syncingRef.current || Date.now() - loadedAt.current < 60_000) return;
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    // Hover only reads saved history; the server's daily job queries the carrier.
    fetch(`/api/trackings/${encodeURIComponent(trackingId)}/history`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取物流轨迹失败，请重试");
        return response.json() as Promise<TrackingHistory>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setHistory(data);
        loadedAt.current = Date.now();
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "读取物流轨迹失败，请重试");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [open, retryCount, trackingId]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          size="icon"
          aria-label={trackingUrl ? `官网查询 ${trackingNumber}，悬浮查看物流轨迹` : `查看 ${trackingNumber} 的物流轨迹`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") showHistory();
          }}
          onPointerLeave={scheduleClose}
          onFocus={() => {
            if (!restoringFocus.current) showHistory();
          }}
          onBlur={scheduleClose}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              showHistory();
              requestAnimationFrame(() => contentRef.current?.focus());
            }
          }}
          onClick={() => {
            if (trackingUrl) {
              window.open(`${trackingUrl}${trackingNumber}`, "_blank", "noopener,noreferrer");
            } else {
              showHistory();
            }
          }}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        id={popoverId}
        aria-labelledby={titleId}
        align="end"
        sideOffset={8}
        tabIndex={0}
        className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(26rem,calc(100vw-2rem))] flex-col p-0 text-left"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => {
          cancelClose();
          returnFocusAfterClose.current = contentRef.current?.contains(document.activeElement) ?? false;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusAfterClose.current) {
            returnFocusAfterClose.current = false;
            // Escape returns keyboard users to the query button without reopening the panel.
            restoringFocus.current = true;
            buttonRef.current?.focus({ preventScroll: true });
            restoringFocus.current = false;
          }
        }}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        onFocusCapture={cancelClose}
        onBlurCapture={scheduleClose}
      >
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="font-semibold">物流轨迹</h2>
              <p className="mt-1 break-all text-xs text-muted-foreground">{trackingNumber}</p>
              {history?.lastSyncedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  抓取于 {formatTime(history.lastSyncedAt)}（北京时间）
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={isSyncing}
              onClick={() => void handleManualSync()}
              aria-label={`手动抓取 ${trackingNumber} 的最新物流轨迹`}
            >
              {isSyncing ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {isSyncing ? "抓取中…" : "手动抓取"}
            </Button>
          </div>
        </div>
        <div className="min-h-0 max-h-[min(26rem,60vh)] overflow-y-auto overscroll-contain p-4" tabIndex={0} aria-label="物流轨迹列表">
          {isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              正在读取物流轨迹…
            </p>
          )}
          {error && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button size="sm" variant="outline" onClick={() => setRetryCount((count) => count + 1)}>重试</Button>
            </div>
          )}
          {!isLoading && !error && history && (
            <>
              {history.lastSyncError && (
                <div className="mb-4 rounded-md bg-muted p-3 text-xs">
                  <p className="font-medium">最近一次查询未成功，已保留历史轨迹</p>
                  <p className="mt-1 break-words text-muted-foreground">{history.lastSyncError}</p>
                  {history.lastSyncAttemptAt && <p className="mt-1 text-muted-foreground">{formatTime(history.lastSyncAttemptAt)}</p>}
                </div>
              )}
              {history.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {history.lastSyncedAt ? "暂无物流轨迹，物流公司尚未返回更新。" : "暂无已保存的物流轨迹。"}
                </p>
              ) : (
                <ol className="space-y-5">
                  {history.events.map((event) => {
                    const style = stageStyle(event.stage);
                    return (
                    <li key={event.id} className="relative border-l border-border pl-4">
                      <span aria-hidden="true" className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ${style.dot}`} />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <time dateTime={event.occurredAt ?? undefined} className="text-xs text-muted-foreground">
                          {event.occurredAt ? formatTime(event.occurredAt) : event.timeText || "时间未知"}
                        </time>
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{event.description}</p>
                      {event.location && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="break-words">{event.location}</span>
                        </p>
                      )}
                    </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
