import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { ALLOWED_TRANSITIONS, transitionSubscription } from '#/lib/lifecycle'
import { deliverCheckoutCallback } from '#/lib/payments/headless'
import { settleVerifiedPayment } from '#/lib/payments/orchestrator'
import {
  record,
  numberValue,
  stringValue,
  verifyStripeSignature,
} from '#/lib/stripe'
import { Prisma } from '#/generated/prisma/client'
import type {
  Currency,
  InvoiceStatus,
  PaymentStatus,
  SubscriptionStatus,
} from '#/generated/prisma/client'

function metadata(value: unknown): Record<string, string> {
  const source = record(value)
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, item]) =>
      typeof item === 'string' ? [[key, item]] : [],
    ),
  )
}

function eventObject(event: Record<string, unknown>): Record<string, unknown> {
  return record(record(event.data).object)
}

function invoiceStatus(value: string | null): InvoiceStatus {
  if (value === 'paid') return 'PAID'
  if (value === 'open') return 'OPEN'
  if (value === 'void') return 'VOID'
  if (value === 'uncollectible') return 'UNCOLLECTIBLE'
  return 'DRAFT'
}

function paymentStatus(value: string | null): PaymentStatus {
  if (value === 'succeeded') return 'SUCCEEDED'
  if (value === 'failed') return 'FAILED'
  if (value === 'refunded') return 'REFUNDED'
  return 'PENDING'
}

function currencyValue(value: string | null): Currency | null {
  const currency = value?.toUpperCase()
  return currency === 'USD' || currency === 'IRR' ? currency : null
}

async function findSubscription(object: Record<string, unknown>) {
  const meta = metadata(object.metadata)
  const id = stringValue(meta.subscriptionId)
  const stripeId = stringValue(object.id)
  const relatedSubscription = stringValue(object.subscription)
  const customer = stringValue(object.customer)
  return db.subscription.findFirst({
    where: {
      deletedAt: null,
      OR: [
        ...(id ? [{ id }] : []),
        ...(stripeId ? [{ providerSubscriptionId: stripeId }] : []),
        ...(relatedSubscription
          ? [{ providerSubscriptionId: relatedSubscription }]
          : []),
        ...(customer ? [{ providerCustomerId: customer }] : []),
      ],
    },
    include: { plan: true },
  })
}

function metadataMatchesSubscription(
  object: Record<string, unknown>,
  subscription: Awaited<ReturnType<typeof findSubscription>>,
): boolean {
  if (!subscription) return true
  const meta = metadata(object.metadata)
  return (
    (!meta.subscriptionId || meta.subscriptionId === subscription.id) &&
    (!meta.tenantId || meta.tenantId === subscription.tenantId) &&
    (!meta.planId || meta.planId === subscription.planId)
  )
}

async function transitionIfAllowed(
  subscriptionId: string,
  target: SubscriptionStatus,
  reason: string,
) {
  const subscription = await db.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: { status: true },
  })
  if (subscription.status === target) return
  if (!ALLOWED_TRANSITIONS[subscription.status].includes(target)) return
  await transitionSubscription(subscriptionId, target, {
    reason,
    metadata: { source: 'stripe' },
  })
}

async function mirrorInvoice(
  object: Record<string, unknown>,
  subscriptionId: string | null,
  paymentOverride?: PaymentStatus,
) {
  const stripeInvoiceId = stringValue(object.id)
  if (!stripeInvoiceId) return
  const subscription = subscriptionId
    ? await db.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      })
    : null
  if (!subscription) return
  const amount =
    numberValue(object.amount_due) ?? numberValue(object.amount_paid) ?? 0
  const currency = currencyValue(stringValue(object.currency))
  if (!currency || amount <= 0 || amount !== subscription.plan.priceMinor)
    throw new Error('Stripe invoice does not match the plan price')
  if (currency !== subscription.plan.currency)
    throw new Error('Stripe invoice does not match the plan currency')
  const status = invoiceStatus(stringValue(object.status))
  const invoice = await db.invoice.upsert({
    where: { number: `stripe:${stripeInvoiceId}` },
    create: {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      number: `stripe:${stripeInvoiceId}`,
      amountMinor: amount,
      currency,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
    },
    update: {
      amountMinor: amount,
      currency,
      status,
      paidAt: status === 'PAID' ? new Date() : null,
    },
  })
  const paymentIntent = stringValue(object.payment_intent)
  if (paymentIntent) {
    const mirroredPaymentStatus =
      paymentOverride ??
      paymentStatus(
        status === 'PAID'
          ? 'succeeded'
          : status === 'UNCOLLECTIBLE'
            ? 'failed'
            : 'pending',
      )
    await db.payment.upsert({
      where: { id: `stripe:${paymentIntent}` },
      create: {
        id: `stripe:${paymentIntent}`,
        tenantId: subscription.tenantId,
        invoiceId: invoice.id,
        amountMinor: amount,
        currency,
        status: mirroredPaymentStatus,
        provider: 'STRIPE',
        providerPaymentId: paymentIntent,
      },
      update: {
        invoiceId: invoice.id,
        amountMinor: amount,
        currency,
        status: mirroredPaymentStatus,
      },
    })
  }
}

async function handleEvent(
  event: Record<string, unknown>,
  subscription: Awaited<ReturnType<typeof findSubscription>>,
) {
  const type = stringValue(event.type)
  const object = eventObject(event)
  const meta = metadata(object.metadata)
  if (type === 'checkout.session.completed') {
    const checkoutId = stringValue(object.client_reference_id)
    const subscriptionId = stringValue(meta.subscriptionId) ?? subscription?.id
    const paymentIntent = stringValue(object.payment_intent)
    const paid = stringValue(object.payment_status) === 'paid'
    if (checkoutId && subscriptionId && paymentIntent && paid) {
      const checkout = await db.paymentCheckout.findUnique({
        where: { id: checkoutId },
        include: { plan: true, service: true },
      })
      if (
        checkout &&
        checkout.status === 'PENDING' &&
        checkout.subscriptionId === subscriptionId &&
        checkout.tenantId === subscription?.tenantId &&
        numberValue(object.amount_total) !== null &&
        currencyValue(stringValue(object.currency)) !== null
      ) {
        const settled = await settleVerifiedPayment({
          provider: 'STRIPE',
          subscriptionId,
          checkoutId,
          planId: checkout.plan.id,
          verified: {
            providerPaymentId: paymentIntent,
            status: 'SUCCEEDED',
            amountMinor: numberValue(object.amount_total),
            currency: currencyValue(stringValue(object.currency)),
          },
        })
        if (!settled.duplicate) {
          await deliverCheckoutCallback(checkout.id)
        }
      }
    }
  } else if (
    type === 'customer.subscription.created' ||
    type === 'customer.subscription.updated'
  ) {
    if (subscription) {
      const stripeSubscriptionId = stringValue(object.id)
      const customerId = stringValue(object.customer)
      const periodEnd = numberValue(object.current_period_end)
      await db.subscription.update({
        where: { id: subscription.id },
        data: {
          ...(stripeSubscriptionId
            ? { providerSubscriptionId: stripeSubscriptionId }
            : {}),
          ...(customerId ? { providerCustomerId: customerId } : {}),
          ...(periodEnd
            ? { currentPeriodEnd: new Date(periodEnd * 1000) }
            : {}),
        },
      })
      const stripeStatus = stringValue(object.status)
      if (stripeStatus === 'active' || stripeStatus === 'trialing')
        await transitionIfAllowed(
          subscription.id,
          'ACTIVE',
          `Stripe subscription ${type}`,
        )
      else if (stripeStatus === 'past_due')
        await transitionIfAllowed(
          subscription.id,
          'PAST_DUE',
          `Stripe subscription ${type}`,
        )
    }
  } else if (type === 'invoice.payment_failed') {
    if (subscription)
      await transitionIfAllowed(
        subscription.id,
        'PAST_DUE',
        'Stripe invoice payment failed',
      )
    if (subscription) await mirrorInvoice(object, subscription.id, 'FAILED')
  } else if (type === 'customer.subscription.deleted') {
    if (subscription)
      await transitionIfAllowed(
        subscription.id,
        'CANCELED',
        'Stripe subscription deleted',
      )
  } else if (type === 'invoice.paid' || type === 'invoice.finalized') {
    if (subscription) {
      await mirrorInvoice(object, subscription.id)
      if (type === 'invoice.paid')
        await transitionIfAllowed(
          subscription.id,
          'ACTIVE',
          'Stripe invoice paid',
        )
    }
  }
}

export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text()
        const signature = request.headers.get('stripe-signature')
        if (!signature || !verifyStripeSignature(payload, signature))
          return Response.json({ error: 'Invalid signature' }, { status: 400 })
        let event: Record<string, unknown>
        try {
          event = record(JSON.parse(payload))
        } catch {
          return Response.json({ error: 'Invalid payload' }, { status: 400 })
        }
        const eventId = stringValue(event.id)
        if (!eventId)
          return Response.json({ error: 'Missing event ID' }, { status: 400 })
        try {
          await db.webhookEvent.create({
            data: { provider: 'STRIPE', eventId },
          })
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            return Response.json({ received: true, duplicate: true })
          }
          throw error
        }
        const object = eventObject(event)
        const relatedSubscription = await findSubscription(object)
        if (!metadataMatchesSubscription(object, relatedSubscription))
          return Response.json({ received: true, ignored: true })
        const candidateTenantId =
          relatedSubscription?.tenantId ?? metadata(object.metadata).tenantId
        const relatedTenant = candidateTenantId
          ? await db.tenant.findUnique({
              where: { id: candidateTenantId, deletedAt: null },
              select: { id: true },
            })
          : null
        if (!relatedTenant)
          return Response.json({ received: true, ignored: true })
        try {
          await handleEvent(event, relatedSubscription)
          const type = stringValue(event.type) ?? 'unknown'
          await db.auditLog.create({
            data: {
              tenantId: relatedTenant.id,
              action: 'stripe.event.processed',
              entityType: 'StripeEvent',
              entityId: eventId,
              metadata: { type },
            },
          })
          return Response.json({ received: true })
        } catch (error) {
          await db.webhookEvent.delete({
            where: { provider_eventId: { provider: 'STRIPE', eventId } },
          })
          throw error
        }
      },
    },
  },
})
