ALTER TABLE "Tracking" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "Tracking" ADD COLUMN "lastSyncAttemptAt" DATETIME;
ALTER TABLE "Tracking" ADD COLUMN "lastSyncError" TEXT;

CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "scraperUrl" TEXT NOT NULL DEFAULT 'http://127.0.0.1:18080'
);

INSERT INTO "AppSettings" ("id", "scraperUrl") VALUES ('default', 'http://127.0.0.1:18080');

CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "occurredAt" DATETIME,
    "timeText" TEXT,
    "description" TEXT NOT NULL,
    "stage" TEXT,
    "location" TEXT,
    "tieOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TrackingEvent_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "Tracking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TrackingEvent_trackingId_eventKey_key" ON "TrackingEvent"("trackingId", "eventKey");
CREATE INDEX "TrackingEvent_trackingId_occurredAt_idx" ON "TrackingEvent"("trackingId", "occurredAt");
CREATE INDEX "Tracking_isArchived_status_idx" ON "Tracking"("isArchived", "status");

CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastRunDate" TEXT,
    "lockedUntil" DATETIME,
    "lockToken" TEXT
);
