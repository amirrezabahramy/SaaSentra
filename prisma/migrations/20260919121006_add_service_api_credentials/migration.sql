-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "serviceApiKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN     "serviceApiKeyHash" TEXT,
ADD COLUMN     "serviceApiKeyLastFour" TEXT,
ADD COLUMN     "serviceApiKeyRevokedAt" TIMESTAMP(3);
