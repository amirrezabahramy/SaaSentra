ALTER TABLE "Subscription"
  ADD COLUMN "submittedSerialKey" TEXT,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationRefundMinor" INTEGER;

UPDATE "Subscription" AS s
SET "submittedSerialKey" = s."serialKey"
FROM "Plan" AS p
WHERE s."planId" = p."id"
  AND p."type" = 'SERIAL_KEY'
  AND s."serialKey" IS NOT NULL;
