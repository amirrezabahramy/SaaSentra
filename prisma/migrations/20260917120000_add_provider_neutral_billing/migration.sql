CREATE TYPE "Currency" AS ENUM ('USD', 'IRR');
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'ZIBAL');

ALTER TABLE "Plan" RENAME COLUMN "priceCents" TO "priceMinor";
ALTER TABLE "Plan" RENAME COLUMN "stripePriceId" TO "providerPriceId";
ALTER TABLE "Plan" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';

ALTER TABLE "Plan" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "Plan"
  ALTER COLUMN "currency" TYPE "Currency"
  USING UPPER("currency")::"Currency";
ALTER TABLE "Plan" ALTER COLUMN "currency" SET DEFAULT 'USD';

ALTER TABLE "Subscription" RENAME COLUMN "stripeCustomerId" TO "providerCustomerId";
ALTER TABLE "Subscription" RENAME COLUMN "stripeSubscriptionId" TO "providerSubscriptionId";

ALTER TABLE "Invoice" RENAME COLUMN "amountCents" TO "amountMinor";
ALTER TABLE "Invoice" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "Invoice"
  ALTER COLUMN "currency" TYPE "Currency"
  USING UPPER("currency")::"Currency";
ALTER TABLE "Invoice" ALTER COLUMN "currency" SET DEFAULT 'USD';

ALTER TABLE "Payment" RENAME COLUMN "amountCents" TO "amountMinor";
ALTER TABLE "Payment" RENAME COLUMN "stripePaymentIntentId" TO "providerPaymentId";
ALTER TABLE "Payment" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE';
ALTER TABLE "Payment" ALTER COLUMN "currency" DROP DEFAULT;
ALTER TABLE "Payment"
  ALTER COLUMN "currency" TYPE "Currency"
  USING UPPER("currency")::"Currency";
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'USD';
