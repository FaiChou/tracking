import { runDailyTrackingSync } from "@/lib/tracking-sync";

const schedulerGlobal = globalThis as typeof globalThis & {
  trackingScheduler?: { timer: ReturnType<typeof setInterval>; running: boolean };
};

export function startTrackingScheduler() {
  if (schedulerGlobal.trackingScheduler) return;
  const state = { timer: undefined as unknown as ReturnType<typeof setInterval>, running: false };
  const tick = async () => {
    if (state.running) return;
    state.running = true;
    try {
      const summary = await runDailyTrackingSync();
      if (summary.acquired) console.info("[tracking-sync] Daily sync finished", summary);
    } catch (error) {
      console.error("[tracking-sync] Daily sync failed", error);
    } finally {
      state.running = false;
    }
  };
  state.timer = setInterval(() => { void tick(); }, 60_000);
  state.timer.unref();
  schedulerGlobal.trackingScheduler = state;
  void tick();
}
