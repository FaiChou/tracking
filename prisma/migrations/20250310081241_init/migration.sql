-- CreateTable
CREATE TABLE "LogisticsCompany" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#000000',
    "trackingUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Forwarder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#000000',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Tracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "logisticsCompanyId" TEXT,
    "forwarderId" TEXT,
    CONSTRAINT "Tracking_logisticsCompanyId_fkey" FOREIGN KEY ("logisticsCompanyId") REFERENCES "LogisticsCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Tracking_forwarderId_fkey" FOREIGN KEY ("forwarderId") REFERENCES "Forwarder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LogisticsCompany_name_key" ON "LogisticsCompany"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Forwarder_name_key" ON "Forwarder"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tracking_trackingNumber_key" ON "Tracking"("trackingNumber");
