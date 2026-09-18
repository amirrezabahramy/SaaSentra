ALTER TABLE "Tenant" ADD COLUMN "billingEmail" TEXT;

ALTER TABLE "Service" DROP COLUMN "endpointUrl";
ALTER TABLE "Service" DROP COLUMN "controlType";

DROP TYPE "ServiceControlType";
