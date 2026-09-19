-- Convert tenant-owned services into reusable services with tenant assignments.
CREATE TABLE "TenantService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantService_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceFlag" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ServiceFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantServiceFlag" (
    "id" TEXT NOT NULL,
    "tenantServiceId" TEXT NOT NULL,
    "serviceFlagId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantServiceFlag_pkey" PRIMARY KEY ("id")
);

-- Every existing service remains available to its current tenant.
INSERT INTO "TenantService" ("id", "tenantId", "serviceId", "createdAt", "updatedAt")
SELECT
  md5('tenant-service:' || "tenantId" || ':' || "id"),
  "tenantId",
  "id",
  "createdAt",
  "updatedAt"
FROM "Service";

-- Existing global flag definitions become definitions for every existing service.
INSERT INTO "ServiceFlag" ("id", "serviceId", "key", "description", "createdAt", "updatedAt", "deletedAt")
SELECT
  md5('service-flag:' || service."id" || ':' || flag."id"),
  service."id",
  flag."key",
  flag."description",
  flag."createdAt",
  flag."updatedAt",
  flag."deletedAt"
FROM "Service" AS service
CROSS JOIN "FeatureFlag" AS flag;

-- Preserve the old per-service assignment state where it exists; missing rows
-- default to disabled so operators explicitly grant access after migration.
INSERT INTO "TenantServiceFlag" (
  "id",
  "tenantServiceId",
  "serviceFlagId",
  "enabled",
  "createdAt",
  "updatedAt"
)
SELECT
  md5('tenant-service-flag:' || assignment."id" || ':' || service_flag."id"),
  assignment."id",
  service_flag."id",
  COALESCE(old_flag."enabled", false),
  COALESCE(old_flag."createdAt", assignment."createdAt"),
  COALESCE(old_flag."updatedAt", assignment."updatedAt")
FROM "TenantService" AS assignment
JOIN "ServiceFlag" AS service_flag
  ON service_flag."serviceId" = assignment."serviceId"
LEFT JOIN "TenantFlag" AS old_flag
  ON old_flag."tenantId" = assignment."tenantId"
 AND old_flag."serviceId" = assignment."serviceId"
 AND old_flag."flagId" = (
   SELECT feature_flag."id"
   FROM "FeatureFlag" AS feature_flag
   WHERE feature_flag."key" = service_flag."key"
   LIMIT 1
 );

ALTER TABLE "TenantService"
ADD CONSTRAINT "TenantService_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantService"
ADD CONSTRAINT "TenantService_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceFlag"
ADD CONSTRAINT "ServiceFlag_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantServiceFlag"
ADD CONSTRAINT "TenantServiceFlag_tenantServiceId_fkey"
FOREIGN KEY ("tenantServiceId") REFERENCES "TenantService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenantServiceFlag"
ADD CONSTRAINT "TenantServiceFlag_serviceFlagId_fkey"
FOREIGN KEY ("serviceFlagId") REFERENCES "ServiceFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TenantService_tenantId_serviceId_key"
ON "TenantService"("tenantId", "serviceId");

CREATE INDEX "TenantService_tenantId_createdAt_idx"
ON "TenantService"("tenantId", "createdAt");

CREATE INDEX "TenantService_serviceId_createdAt_idx"
ON "TenantService"("serviceId", "createdAt");

CREATE UNIQUE INDEX "ServiceFlag_serviceId_key_key"
ON "ServiceFlag"("serviceId", "key");

CREATE INDEX "ServiceFlag_serviceId_createdAt_idx"
ON "ServiceFlag"("serviceId", "createdAt");

CREATE UNIQUE INDEX "TenantServiceFlag_tenantServiceId_serviceFlagId_key"
ON "TenantServiceFlag"("tenantServiceId", "serviceFlagId");

CREATE INDEX "TenantServiceFlag_tenantServiceId_createdAt_idx"
ON "TenantServiceFlag"("tenantServiceId", "createdAt");

CREATE INDEX "TenantServiceFlag_serviceFlagId_createdAt_idx"
ON "TenantServiceFlag"("serviceFlagId", "createdAt");

DROP TABLE "TenantFlag";
DROP TABLE "FeatureFlag";

ALTER TABLE "Service" DROP CONSTRAINT "Service_tenantId_fkey";
DROP INDEX "Service_tenantId_createdAt_idx";
ALTER TABLE "Service" DROP COLUMN "tenantId";

ALTER TABLE "AuditLog" ALTER COLUMN "tenantId" DROP NOT NULL;
