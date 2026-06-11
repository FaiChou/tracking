-- AlterTable
ALTER TABLE "LogisticsCompany" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Forwarder" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
