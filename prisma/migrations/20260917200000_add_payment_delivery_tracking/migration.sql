-- CreateEnum
CREATE TYPE "PaymentDeliveryStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'NOT_CONFIGURED');

-- CreateTable
CREATE TABLE "PaymentDelivery" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "status" "PaymentDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentDelivery_checkoutId_key" ON "PaymentDelivery"("checkoutId");

-- AddForeignKey
ALTER TABLE "PaymentDelivery" ADD CONSTRAINT "PaymentDelivery_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "PaymentCheckout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
