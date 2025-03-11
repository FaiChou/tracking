-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "logisticsCompanyId" TEXT,
    "forwarderId" TEXT,
    CONSTRAINT "Tracking_logisticsCompanyId_fkey" FOREIGN KEY ("logisticsCompanyId") REFERENCES "LogisticsCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tracking_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Forwarder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tracking" ("createdAt", "forwarderId", "id", "isArchived", "logisticsCompanyId", "note", "status", "trackingNumber", "updatedAt") SELECT "createdAt", "forwarderId", "id", "isArchived", "logisticsCompanyId", "note", "status", "trackingNumber", "updatedAt" FROM "Tracking";
DROP TABLE "Tracking";
ALTER TABLE "new_Tracking" RENAME TO "Tracking";
CREATE UNIQUE INDEX "Tracking_trackingNumber_key" ON "Tracking"("trackingNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
