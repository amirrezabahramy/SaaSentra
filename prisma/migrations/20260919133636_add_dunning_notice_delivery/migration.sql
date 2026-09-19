-- CreateEnum
CREATE TYPE "DunningNoticeStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "DunningNotice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "noticeType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "toEmail" TEXT,
    "status" "DunningNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DunningNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DunningNotice_status_createdAt_idx" ON "DunningNotice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DunningNotice_tenantId_createdAt_idx" ON "DunningNotice"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DunningNotice_subscriptionId_noticeType_periodKey_key" ON "DunningNotice"("subscriptionId", "noticeType", "periodKey");

-- AddForeignKey
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningNotice" ADD CONSTRAINT "DunningNotice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
