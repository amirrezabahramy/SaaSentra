ALTER TYPE "Role" ADD VALUE 'TENANT';

ALTER TABLE "User"
ADD COLUMN "role" "Role",
ADD COLUMN "tenantId" TEXT;

UPDATE "User" AS u
SET "role" = 'OWNER'
WHERE EXISTS (
  SELECT 1
  FROM "Membership" AS m
  WHERE m."userId" = u."id"
    AND m."role" = 'OWNER'
    AND m."deletedAt" IS NULL
);

UPDATE "User" AS u
SET "role" = 'ADMIN'
WHERE u."role" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "Membership" AS m
    WHERE m."userId" = u."id"
      AND m."role" = 'ADMIN'
      AND m."deletedAt" IS NULL
  );

-- Legacy users without a membership have no tenant association to migrate.
-- Keep them as global admins rather than guessing a tenant.
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "role" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "role" SET NOT NULL;

DROP TABLE "Membership";

CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

ALTER TABLE "User"
ADD CONSTRAINT "User_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
ADD CONSTRAINT "User_role_tenant_check"
CHECK (
  ("role" IN ('OWNER', 'ADMIN') AND "tenantId" IS NULL)
  OR ("role" = 'TENANT' AND "tenantId" IS NOT NULL)
);
