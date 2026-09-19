import { db } from '#/db'
import { generateSerialKey } from '#/lib/lifecycle'
import { Prisma } from '#/generated/prisma/client'
import type { PaymentProvider, VerifiedPayment } from './types'

const permanentPeriodEnd = new Date('9999-12-31T23:59:59.999Z')

function nextPeriodEnd(
  currentPeriodEnd: Date,
  interval: string,
  isPermanent: boolean,
) {
  if (isPermanent) return permanentPeriodEnd
  const base = new Date(Math.max(Date.now(), currentPeriodEnd.getTime()))
  const match = interval.match(/^(\d+)?\s*(day|week|month|year)s?$/i)
  const dayMatch = interval.match(/^(\d+)\s*days?$/i)
  if (dayMatch) base.setDate(base.getDate() + Number(dayMatch[1]))
  if (dayMatch) return base
  const count = Number(match?.[1] ?? 1)
  const unit = match?.[2]?.toLowerCase() ?? 'month'
  if (unit === 'day') base.setDate(base.getDate() + count)
  if (unit === 'week') base.setDate(base.getDate() + count * 7)
  if (unit === 'month') base.setMonth(base.getMonth() + count)
  if (unit === 'year') base.setFullYear(base.getFullYear() + count)
  return base
}

export async function settleVerifiedPayment(input: {
  provider: PaymentProvider
  subscriptionId: string
  verified: VerifiedPayment
  checkoutId?: string
  planId?: string
}) {
  if (input.verified.status !== 'SUCCEEDED')
    throw new Error('Payment was not successful')

  try {
    return await db.$transaction(async (tx) => {
      const paymentId = `${input.provider.toLowerCase()}:${input.verified.providerPaymentId}`
      const existing = await tx.payment.findUnique({ where: { id: paymentId } })
      if (existing) return { payment: existing, duplicate: true }

      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: input.subscriptionId, deletedAt: null },
        include: { plan: true },
      })
      const targetPlan = input.planId
        ? await tx.plan.findUniqueOrThrow({ where: { id: input.planId } })
        : subscription.plan
      if (input.checkoutId) {
        const checkout = await tx.paymentCheckout.findUnique({
          where: { id: input.checkoutId },
        })
        if (
          !checkout ||
          checkout.status !== 'PENDING' ||
          checkout.provider !== input.provider ||
          checkout.subscriptionId !== subscription.id ||
          checkout.tenantId !== subscription.tenantId ||
          checkout.planId !== targetPlan.id
        ) {
          throw new Error('Payment checkout does not match the subscription')
        }
      }
      if (subscription.status === 'ARCHIVED' || subscription.deletedAt)
        throw new Error('Archived subscriptions cannot receive payments')
      if (subscription.status === 'CANCELED')
        throw new Error('This subscription cannot receive payments')
      if (
        (subscription.status === 'DISABLED' ||
          subscription.status === 'DISABLED_AT_PERIOD_END') &&
        subscription.currentPeriodEnd > new Date()
      )
        throw new Error(
          'This subscription cannot be reactivated before its period ends',
        )
      const verifiedAmount = input.verified.amountMinor
      const verifiedCurrency = input.verified.currency
      if (verifiedAmount === null || verifiedAmount !== targetPlan.priceMinor)
        throw new Error('Payment amount does not match the plan price')
      if (verifiedCurrency === null || verifiedCurrency !== targetPlan.currency)
        throw new Error('Payment currency does not match the plan currency')

      const amountMinor = verifiedAmount
      const currency = verifiedCurrency
      const invoiceNumber = `${input.provider.toLowerCase()}:${input.verified.providerPaymentId}`
      const now = new Date()
      const invoice = await tx.invoice.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          number: invoiceNumber,
          amountMinor,
          currency,
          status: 'PAID',
          paidAt: now,
        },
      })
      const payment = await tx.payment.create({
        data: {
          id: paymentId,
          tenantId: subscription.tenantId,
          invoiceId: invoice.id,
          amountMinor,
          currency,
          status: 'SUCCEEDED',
          provider: input.provider,
          providerPaymentId: input.verified.providerPaymentId,
        },
      })
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: nextPeriodEnd(
            subscription.currentPeriodEnd,
            targetPlan.interval,
            targetPlan.isPermanent,
          ),
          planId: targetPlan.id,
          graceEndsAt: null,
          disabledAt: null,
          serialKey:
            targetPlan.type === 'SERIAL_KEY'
              ? (subscription.serialKey ?? generateSerialKey())
              : null,
          submittedSerialKey:
            targetPlan.type === 'SERIAL_KEY' &&
            subscription.plan.type === 'SERIAL_KEY' &&
            targetPlan.id === subscription.plan.id
              ? subscription.submittedSerialKey
              : null,
        },
      })
      if (input.checkoutId) {
        await tx.paymentCheckout.update({
          where: { id: input.checkoutId },
          data: {
            status: 'SUCCEEDED',
            providerPaymentId: input.verified.providerPaymentId,
          },
        })
        await tx.paymentDelivery.upsert({
          where: { checkoutId: input.checkoutId },
          create: { checkoutId: input.checkoutId },
          update: { status: 'PENDING', lastError: null },
        })
      }
      await tx.auditLog.create({
        data: {
          tenantId: subscription.tenantId,
          action: 'payment.succeeded',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: {
            provider: input.provider,
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
          },
        },
      })
      return {
        payment,
        invoice,
        subscription: updatedSubscription,
        duplicate: false,
      }
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const payment = await db.payment.findUnique({
        where: {
          id: `${input.provider.toLowerCase()}:${input.verified.providerPaymentId}`,
        },
      })
      if (payment) return { payment, duplicate: true }
    }
    throw error
  }
}
