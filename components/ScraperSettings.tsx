"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Settings = { scraperUrl: string; dailySyncTime: string };

function isSettings(value: unknown): value is Settings {
  return value !== null && typeof value === "object"
    && "scraperUrl" in value && typeof value.scraperUrl === "string"
    && "dailySyncTime" in value && typeof value.dailySyncTime === "string";
}

export default function ScraperSettings({ onSaved }: { onSaved?: () => void }) {
  const [scraperUrl, setScraperUrl] = useState("http://127.0.0.1:18080");
  const [dailySyncTime, setDailySyncTime] = useState("05:00");
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
        const data: unknown = await response.json();
        if (!isSettings(data)) throw new Error("设置数据格式错误，请重试");
        if (!controller.signal.aborted) {
          setScraperUrl(data.scraperUrl);
          setDailySyncTime(data.dailySyncTime);
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

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || loading || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scraperUrl: scraperUrl.trim(), dailySyncTime }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "保存设置失败，请重试");
      if (!isSettings(data)) throw new Error("设置数据格式错误，请重新读取确认");
      setScraperUrl(data.scraperUrl);
      setDailySyncTime(data.dailySyncTime);
      toast.success("设置已保存");
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存设置失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="scraper-settings-title" className="rounded-lg border bg-card p-5 sm:p-6">
      <h2 id="scraper-settings-title" className="text-lg font-semibold">查询设置</h2>
      <form onSubmit={saveSettings} className="mt-5 space-y-4" aria-busy={loading || saving}>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-2">
            <Label htmlFor="scraper-url">Scraper 服务地址</Label>
            <Input
              id="scraper-url" value={scraperUrl}
              onChange={(event) => setScraperUrl(event.target.value)}
              placeholder="127.0.0.1:18080" autoComplete="off" spellCheck={false} required
              disabled={loading || saving || !loaded} aria-describedby="scraper-url-help"
            />
            <p id="scraper-url-help" className="text-xs leading-relaxed text-muted-foreground">
              填写管理系统能访问的地址；127.0.0.1 指运行管理系统的主机。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="daily-sync-time">每日抓取时间</Label>
            <Input
              id="daily-sync-time" type="time" step={60} value={dailySyncTime}
              onChange={(event) => setDailySyncTime(event.target.value)} required
              disabled={loading || saving || !loaded} aria-describedby="daily-sync-time-help"
            />
            <p id="daily-sync-time-help" className="text-xs text-muted-foreground">北京时间（UTC+8）</p>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          {!loading && !loaded ? (
            <Button type="button" variant="outline" onClick={() => setRetry(value => value + 1)}>重试读取设置</Button>
          ) : (
            <Button type="submit" disabled={loading || saving || !loaded || !scraperUrl.trim() || !dailySyncTime}>
              {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "读取中…" : saving ? "保存中…" : "保存设置"}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
