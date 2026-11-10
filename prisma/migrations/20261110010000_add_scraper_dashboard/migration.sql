ALTER TABLE "AppSettings" ADD COLUMN "dailySyncTime" TEXT NOT NULL DEFAULT '05:00';
ALTER TABLE "SyncJob" ADD COLUMN "activeRunId" TEXT;

CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "currentTrackingNumber" TEXT,
    "stopRequested" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");
