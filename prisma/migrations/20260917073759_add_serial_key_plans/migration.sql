/*
  Warnings:

  - A unique constraint covering the columns `[serialKey]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('SUBSCRIPTION', 'SERIAL_KEY');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "isPermanent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "type" "PlanType" NOT NULL DEFAULT 'SUBSCRIPTION';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "serialKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_serialKey_key" ON "Subscription"("serialKey");
