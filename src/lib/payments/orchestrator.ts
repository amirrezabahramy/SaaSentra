import { db } from '#/db'
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
}) {
  if (input.verified.status !== 'SUCCEEDED')
    throw new Error('Payment was not successful')

  return db.$transaction(async (tx) => {
    const paymentId = `${input.provider.toLowerCase()}:${input.verified.providerPaymentId}`
    const existing = await tx.payment.findUnique({ where: { id: paymentId } })
    if (existing) return { payment: existing, duplicate: true }

    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { id: input.subscriptionId, deletedAt: null },
      include: { plan: true },
    })
    if (subscription.status === 'ARCHIVED')
      throw new Error('Archived subscriptions cannot receive payments')
    if (
      input.verified.amountMinor !== null &&
      input.verified.amountMinor !== subscription.plan.priceMinor
    )
      throw new Error('Payment amount does not match the plan price')
    if (
      input.verified.currency !== null &&
      input.verified.currency !== subscription.plan.currency
    )
      throw new Error('Payment currency does not match the plan currency')

    const amountMinor =
      input.verified.amountMinor ?? subscription.plan.priceMinor
    const currency = input.verified.currency ?? subscription.plan.currency
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
          subscription.plan.interval,
          subscription.plan.isPermanent,
        ),
        graceEndsAt: null,
        disabledAt: null,
      },
    })
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
}
