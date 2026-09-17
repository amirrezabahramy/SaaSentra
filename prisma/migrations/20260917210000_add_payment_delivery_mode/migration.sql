CREATE TYPE "ServicePaymentDeliveryMode" AS ENUM ('CALLBACK', 'EMAIL', 'CALLBACK_AND_EMAIL');

ALTER TABLE "Service"
  ADD COLUMN "paymentDeliveryMode" "ServicePaymentDeliveryMode" NOT NULL DEFAULT 'CALLBACK';
