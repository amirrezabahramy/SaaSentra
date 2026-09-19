-- Add the service association while preserving existing tenant-level flag data.
ALTER TABLE "TenantFlag"
ADD COLUMN "serviceId" TEXT;

-- Assign each existing flag to the first service of its tenant.
WITH first_service AS (
  SELECT DISTINCT ON ("tenantId")
    "tenantId",
    "id"
  FROM "Service"
  WHERE "deletedAt" IS NULL
  ORDER BY "tenantId", "createdAt", "id"
)
UPDATE "TenantFlag" AS tenant_flag
SET "serviceId" = first_service."id"
FROM first_service
WHERE tenant_flag."tenantId" = first_service."tenantId";

-- Copy each existing flag to the tenant's remaining services.
INSERT INTO "TenantFlag" (
  "id",
  "tenantId",
  "serviceId",
  "flagId",
  "enabled",
  "createdAt",
  "updatedAt"
)
SELECT
  md5(tenant_flag."id" || ':' || service."id"),
  tenant_flag."tenantId",
  service."id",
  tenant_flag."flagId",
  tenant_flag."enabled",
  tenant_flag."createdAt",
  tenant_flag."updatedAt"
FROM "TenantFlag" AS tenant_flag
JOIN "Service" AS service
  ON service."tenantId" = tenant_flag."tenantId"
WHERE service."id" <> tenant_flag."serviceId";

-- Flags for tenants without services have no valid service scope.
DELETE FROM "TenantFlag"
WHERE "serviceId" IS NULL;

ALTER TABLE "TenantFlag"
ALTER COLUMN "serviceId" SET NOT NULL;

DROP INDEX "TenantFlag_tenantId_flagId_key";

CREATE UNIQUE INDEX "TenantFlag_serviceId_flagId_key"
ON "TenantFlag"("serviceId", "flagId");

CREATE INDEX "TenantFlag_serviceId_createdAt_idx"
ON "TenantFlag"("serviceId", "createdAt");

ALTER TABLE "TenantFlag"
ADD CONSTRAINT "TenantFlag_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
