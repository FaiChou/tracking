import { schedulerEnabled } from "@/lib/tracking-schedule";

export async function register() {
  // Keep the Node-only dependency out of Next's Edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME === "nodejs" && schedulerEnabled({
    ...process.env,
    NEXT_RUNTIME: process.env.NEXT_RUNTIME,
    NODE_ENV: process.env.NODE_ENV,
  })) {
    const { startTrackingScheduler } = await import("@/lib/tracking-scheduler");
    startTrackingScheduler();
  }
}
