"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  formatStatusChangeTimestamp,
  isStatusChange,
  SOURCE_BADGE_STYLES,
  SOURCE_LABELS,
  STATUS_BADGE_STYLES,
  STATUS_DOT_COLORS,
  STATUS_LABELS,
  type StatusChange,
} from "@/lib/tracking-status-changes-ui";

const POPOVER_LIMIT = 200;

export default function TrackingStatusChangesPopover() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<StatusChange[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  const openRef = useRef(false);
  const requestRefresh = useRef<(() => void) | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedOpen = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
      if (
        !contentRef.current?.contains(document.activeElement)
        && !buttonRef.current?.contains(document.activeElement)
      ) {
        setOpen(false);
      }
    }, 200);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let pendingRefresh = false;
    let activeRequest: AbortController | null = null;

    async function loadLogs() {
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
      setIsLoading(true);
      try {
        const response = await fetch(`/api/trackings/status-changes?limit=${POPOVER_LIMIT}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("读取状态变更记录失败，请重试");
        const data: unknown = await response.json();
        if (
          data === null
          || typeof data !== "object"
          || !("logs" in data)
          || !Array.isArray(data.logs)
          || !data.logs.every(isStatusChange)
          || !("limit" in data)
          || data.limit !== POPOVER_LIMIT
          || !("hasMore" in data)
          || typeof data.hasMore !== "boolean"
        ) {
          throw new Error("状态变更记录格式错误，请重试");
        }
        if (!disposed) {
          setLogs(data.logs);
          setHasMore(data.hasMore);
          setError("");
        }
      } catch (cause) {
        if (!disposed) {
          setError(
            controller.signal.aborted
              ? "读取状态变更记录超时，请重试"
              : cause instanceof Error
                ? cause.message
                : "读取状态变更记录失败，请重试",
          );
        }
      } finally {
        clearTimeout(timeout);
        activeRequest = null;
        inFlight = false;
        if (!disposed) {
          if (pendingRefresh && openRef.current) void loadLogs();
          else setIsLoading(false);
        }
      }
    }

    requestRefresh.current = () => {
      void loadLogs();
    };
    return () => {
      disposed = true;
      requestRefresh.current = null;
      activeRequest?.abort();
    };
  }, []);

  useEffect(() => {
    openRef.current = open;
    if (open) requestRefresh.current?.();
  }, [open, refreshCount]);

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          pinnedOpen.current = false;
          cancelClose();
        }
        setOpen(value);
      }}
    >
      <PopoverAnchor asChild>
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          size="icon"
          aria-label="查看最近状态变更"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popoverId : undefined}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") show();
          }}
          onPointerLeave={scheduleClose}
          onFocus={() => {
            if (!restoringFocus.current) show();
          }}
          onBlur={scheduleClose}
          onClick={() => {
            if (pinnedOpen.current) {
              pinnedOpen.current = false;
              cancelClose();
              setOpen(false);
            } else {
              pinnedOpen.current = true;
              show();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              pinnedOpen.current = true;
              show();
              requestAnimationFrame(() => contentRef.current?.focus());
            }
          }}
        >
          <History aria-hidden="true" className="h-4 w-4" />
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
        <div className="shrink-0 border-b px-4 py-2.5">
          <h2 id={titleId} className="font-semibold">最近状态变更</h2>
        </div>

        <div className="min-h-0 max-h-[min(38rem,75vh)] overflow-y-auto overscroll-contain p-4" tabIndex={0} aria-label="最近状态变更列表">
          {error && (
            <div role="alert" className={`${logs !== null ? "mb-4 " : ""}space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3`}>
              <p className="text-sm text-destructive">
                {error}{logs !== null ? "，以下保留上次加载的记录。" : ""}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isLoading}
                onClick={() => setRefreshCount(value => value + 1)}
              >
                重试
              </Button>
            </div>
          )}

          {logs === null && isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              正在读取状态变更记录…
            </p>
          )}

          {logs !== null && logs.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">暂无状态变更记录</p>
          )}

          {logs !== null && logs.length > 0 && (
            <ol className="space-y-3">
              {logs.map(log => (
                <li key={log.id} className="relative border-l border-border pl-4">
                  <span aria-hidden="true" className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full ${STATUS_DOT_COLORS[log.toStatus]}`} />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <time dateTime={log.createdAt} className="text-xs tabular-nums text-muted-foreground">
                      {formatStatusChangeTimestamp(log.createdAt)}
                    </time>
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${SOURCE_BADGE_STYLES[log.source]}`}>
                      {SOURCE_LABELS[log.source]}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="min-w-0 break-all text-sm font-medium">{log.trackingNumber}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE_STYLES[log.fromStatus]}`}>
                        {STATUS_LABELS[log.fromStatus]}
                      </span>
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="sr-only">变为</span>
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE_STYLES[log.toStatus]}`}>
                        {STATUS_LABELS[log.toStatus]}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {logs === null ? "最多展示 200 条" : hasMore ? "仅显示最近 200 条" : `共 ${logs.length} 条记录`}
          </span>
          <Link
            href="/scraper#tracking-status-changes"
            onClick={() => {
              pinnedOpen.current = false;
              setOpen(false);
            }}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            去 scraper 查看全部
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
