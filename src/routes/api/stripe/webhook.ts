import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { ALLOWED_TRANSITIONS, transitionSubscription } from '#/lib/lifecycle'
import {
  record,
  numberValue,
  stringValue,
  verifyStripeSignature,
} from '#/lib/stripe'
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
      OR: [
        ...(id ? [{ id }] : []),
        ...(stripeId ? [{ providerSubscriptionId: stripeId }] : []),
        ...(relatedSubscription
          ? [{ providerSubscriptionId: relatedSubscription }]
          : []),
        ...(customer ? [{ providerCustomerId: customer }] : []),
      ],
    },
  })
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
    ? await db.subscription.findUnique({ where: { id: subscriptionId } })
    : null
  if (!subscription) return
  const amount =
    numberValue(object.amount_due) ?? numberValue(object.amount_paid) ?? 0
  const currency = currencyValue(stringValue(object.currency))
  if (!currency) return
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
    const subscriptionId = stringValue(meta.subscriptionId) ?? subscription?.id
    if (subscriptionId)
      await transitionIfAllowed(
        subscriptionId,
        'ACTIVE',
        'Stripe checkout completed',
      )
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
      await transitionIfAllowed(
        subscription.id,
        'ACTIVE',
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
    if (subscription) await mirrorInvoice(object, subscription.id)
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
        const existing = await db.auditLog.findFirst({
          where: { action: 'stripe.event.processed', entityId: eventId },
        })
        if (existing) return Response.json({ received: true, duplicate: true })
        const object = eventObject(event)
        const relatedSubscription = await findSubscription(object)
        const candidateTenantId =
          relatedSubscription?.tenantId ?? metadata(object.metadata).tenantId
        const relatedTenant = candidateTenantId
          ? await db.tenant.findUnique({
              where: { id: candidateTenantId },
              select: { id: true },
            })
          : null
        if (!relatedTenant)
          return Response.json({ received: true, ignored: true })
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
      },
    },
  },
})
