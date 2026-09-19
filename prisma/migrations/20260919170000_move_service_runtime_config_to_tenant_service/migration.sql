ALTER TABLE "TenantService"
ADD COLUMN "serviceApiKeyHash" TEXT,
ADD COLUMN "serviceApiKeyLastFour" TEXT,
ADD COLUMN "serviceApiKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN "serviceApiKeyRevokedAt" TIMESTAMP(3),
ADD COLUMN "deployStatus" "ServiceDeployStatus" NOT NULL DEFAULT 'HEALTHY',
ADD COLUMN "paymentCallbackUrl" TEXT,
ADD COLUMN "paymentCallbackSecret" TEXT,
ADD COLUMN "paymentDeliveryMode" "ServicePaymentDeliveryMode" NOT NULL DEFAULT 'CALLBACK';

UPDATE "TenantService" AS assignment
SET
  "serviceApiKeyHash" = service."serviceApiKeyHash",
  "serviceApiKeyLastFour" = service."serviceApiKeyLastFour",
  "serviceApiKeyCreatedAt" = service."serviceApiKeyCreatedAt",
  "serviceApiKeyRevokedAt" = service."serviceApiKeyRevokedAt",
  "deployStatus" = service."deployStatus",
  "paymentCallbackUrl" = service."paymentCallbackUrl",
  "paymentCallbackSecret" = service."paymentCallbackSecret",
  "paymentDeliveryMode" = service."paymentDeliveryMode"
FROM "Service" AS service
WHERE assignment."serviceId" = service."id";

ALTER TABLE "Service"
DROP COLUMN "serviceApiKeyHash",
DROP COLUMN "serviceApiKeyLastFour",
DROP COLUMN "serviceApiKeyCreatedAt",
DROP COLUMN "serviceApiKeyRevokedAt",
DROP COLUMN "deployStatus",
DROP COLUMN "paymentCallbackUrl",
DROP COLUMN "paymentCallbackSecret",
DROP COLUMN "paymentDeliveryMode";
