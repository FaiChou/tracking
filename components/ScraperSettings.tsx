"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Settings = { scraperUrl: string; dailySyncTime: string; dailySyncTimes: string[] };

const SUGGESTED_SYNC_TIMES = ["05:00", "12:00", "17:00", "21:00", "09:00", "15:00", "23:00", "01:00"];

function parseSettings(value: unknown): Settings | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.scraperUrl !== "string" || typeof record.dailySyncTime !== "string") return null;
  const times = Array.isArray(record.dailySyncTimes)
    && record.dailySyncTimes.every((item): item is string => typeof item === "string" && item.trim().length > 0)
    && record.dailySyncTimes.length > 0
    ? record.dailySyncTimes.map(item => item.trim())
    : record.dailySyncTime.split(",").map(item => item.trim()).filter(Boolean);
  if (times.length === 0) return null;
  return {
    scraperUrl: record.scraperUrl,
    dailySyncTime: times.join(","),
    dailySyncTimes: times,
  };
}

export default function ScraperSettings({ onSaved }: { onSaved?: () => void }) {
  const [scraperUrl, setScraperUrl] = useState("http://127.0.0.1:18080");
  const [dailySyncTimes, setDailySyncTimes] = useState<string[]>(["05:00"]);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);

  // Task polling must not overwrite unsaved settings.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoaded(false);
    setError("");
    async function loadSettings() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("读取设置失败，请重试");
        const raw: unknown = await response.json();
        const data = parseSettings(raw);
        if (!data) throw new Error("设置数据格式错误，请重试");
        if (!controller.signal.aborted) {
          setScraperUrl(data.scraperUrl);
          setDailySyncTimes(data.dailySyncTimes);
          setSavedSettings(data);
          setLoaded(true);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取设置失败，请重试");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadSettings();
    return () => controller.abort();
  }, [retry]);

  const normalizedInputs = dailySyncTimes.map(time => time.trim());
  const hasValidTimes = normalizedInputs.length > 0 && normalizedInputs.every(time => Boolean(time));
  const hasChanges = savedSettings !== null && (
    scraperUrl.trim() !== savedSettings.scraperUrl
    || normalizedInputs.length !== savedSettings.dailySyncTimes.length
    || normalizedInputs.some((time, index) => time !== savedSettings.dailySyncTimes[index])
  );

  function updateSyncTime(index: number, value: string) {
    setDailySyncTimes(current => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addSyncTime() {
    setDailySyncTimes(current => {
      const existing = new Set(current.map(item => item.trim()));
      const nextTime = SUGGESTED_SYNC_TIMES.find(candidate => !existing.has(candidate)) ?? "12:00";
      return [...current, nextTime];
    });
  }

  function removeSyncTime(index: number) {
    setDailySyncTimes(current => (current.length <= 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || loading || saving || !hasChanges || !hasValidTimes) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scraperUrl: scraperUrl.trim(),
          dailySyncTimes: normalizedInputs,
          dailySyncTime: normalizedInputs.join(","),
        }),
      });
      const raw: unknown = await response.json();
      if (!response.ok) {
        const message = raw !== null && typeof raw === "object" && "message" in raw && typeof raw.message === "string"
          ? raw.message
          : "保存设置失败，请重试";
        throw new Error(message);
      }
      const data = parseSettings(raw);
      if (!data) throw new Error("设置数据格式错误，请重新读取确认");
      setScraperUrl(data.scraperUrl);
      setDailySyncTimes(data.dailySyncTimes);
      setSavedSettings(data);
      toast.success("设置已保存");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存设置失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const controlsDisabled = loading || saving || !loaded;

  return (
    <section aria-labelledby="scraper-settings-title" className="rounded-lg border bg-card p-5 sm:p-6">
      <h2 id="scraper-settings-title" className="text-lg font-semibold">查询设置</h2>
      <form onSubmit={saveSettings} className="mt-5 space-y-4" aria-busy={loading || saving}>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(0,1.4fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="scraper-url">Scraper 服务地址</Label>
            <Input
              id="scraper-url" value={scraperUrl}
              onChange={(event) => setScraperUrl(event.target.value)}
              placeholder="127.0.0.1:18080" autoComplete="off" spellCheck={false} required
              disabled={controlsDisabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily-sync-time-0">每日抓取时间</Label>
            <div className="flex flex-wrap items-center gap-2">
              {dailySyncTimes.map((time, index) => (
                <div key={index} className="flex items-center gap-1">
                  <Input
                    id={`daily-sync-time-${index}`}
                    aria-label={`每日抓取时间 ${index + 1}`}
                    type="time"
                    step={60}
                    value={time}
                    onChange={(event) => updateSyncTime(index, event.target.value)}
                    required
                    disabled={controlsDisabled}
                    className="w-[136px]"
                  />
                  {dailySyncTimes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label={`删除抓取时间 ${index + 1}`}
                      title="删除此抓取时间"
                      disabled={controlsDisabled}
                      onClick={() => removeSyncTime(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={controlsDisabled}
                onClick={addSyncTime}
              >
                <Plus className="h-4 w-4" />
                添加时间
              </Button>
            </div>
          </div>
          <div className="lg:pt-6">
            {!loading && !loaded ? (
              <Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>重试读取设置</Button>
            ) : (
              <Button type="submit" disabled={controlsDisabled || !hasChanges || !scraperUrl.trim() || !hasValidTimes}>
                {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "读取中…" : saving ? "保存中…" : "保存设置"}
              </Button>
            )}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </section>
  );
}
