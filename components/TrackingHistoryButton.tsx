"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin } from "lucide-react";
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

const STAGE_LABELS: Record<string, string> = {
  pending: "待处理",
  registered: "已登记",
  accepted: "已揽收",
  pre_transit: "待揽收",
  info_received: "已收到物流信息",
  information_received: "已收到物流信息",
  picked_up: "已揽收",
  transit: "运输中",
  in_transit: "运输中",
  customs: "清关中",
  out_for_delivery: "派送中",
  available_for_pickup: "待取件",
  ready_for_pickup: "待取件",
  delivered: "已签收",
  exception: "异常",
  failed_attempt: "投递未成功",
  returned: "已退回",
  return_to_sender: "退回寄件人",
  cancelled: "已取消",
  unknown: "未知状态",
};

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
}: {
  trackingId: string;
  trackingNumber: string;
  trackingUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<TrackingHistory | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocusAfterClose = useRef(false);
  const restoringFocus = useRef(false);
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
    closeTimer.current = setTimeout(() => {
      if (!contentRef.current?.contains(document.activeElement)) setOpen(false);
    }, 200);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    if (!open || Date.now() - loadedAt.current < 60_000) return;
    const controller = new AbortController();
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
          <h2 id={titleId} className="font-semibold">物流轨迹</h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">{trackingNumber}</p>
          {history?.lastSyncedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              更新于 {formatTime(history.lastSyncedAt)}（北京时间）
            </p>
          )}
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
                  {history.events.map((event, index) => (
                    <li key={event.id} className="relative border-l border-border pl-4">
                      <span aria-hidden="true" className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ${index === 0 ? "bg-primary" : "bg-muted-foreground/50"}`} />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <time dateTime={event.occurredAt ?? undefined} className="text-xs text-muted-foreground">
                          {event.occurredAt ? formatTime(event.occurredAt) : event.timeText || "时间未知"}
                        </time>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {event.stage ? STAGE_LABELS[event.stage.toLowerCase()] || event.stage : "未知状态"}
                        </span>
                        {index === 0 && <span className="text-xs font-medium text-primary">最新</span>}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{event.description}</p>
                      {event.location && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
                          <span className="break-words">{event.location}</span>
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
