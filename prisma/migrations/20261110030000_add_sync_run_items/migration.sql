ALTER TABLE "SyncRun" ADD COLUMN "hasDetails" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SyncRun" ADD COLUMN "retryOfRunId" TEXT;

CREATE TABLE "SyncRunItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "runId" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SyncRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SyncRunItem_runId_trackingId_key" ON "SyncRunItem"("runId", "trackingId");
CREATE INDEX "SyncRunItem_runId_outcome_idx" ON "SyncRunItem"("runId", "outcome");
