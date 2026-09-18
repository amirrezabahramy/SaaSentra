import { env } from '#/env'
import bcrypt from 'bcryptjs'
import {
  PrismaClient,
  ServiceControlType,
  ServiceDeployStatus,
} from '#/generated/prisma/client'

import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
const db = new PrismaClient({ adapter })

const ownerEmail = process.env.OWNER_EMAIL ?? 'owner@example.com'
const ownerPassword = process.env.OWNER_PASSWORD ?? 'Owner123!'
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com'
const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin123!'
const starterStripePriceId = 'price_starter_test'
const proStripePriceId = 'price_pro_test'

async function main() {
  // --- Plans -------------------------------------------------------------
  const starter = await db.plan.upsert({
    where: { slug: 'starter' },
    update: { providerPriceId: starterStripePriceId },
    create: {
      name: 'Starter',
      slug: 'starter',
      priceMinor: 1900,
      currency: 'USD',
      interval: 'month',
      trialDays: 14,
      provider: 'STRIPE',
      providerPriceId: starterStripePriceId,
    },
  })
  const pro = await db.plan.upsert({
    where: { slug: 'pro' },
    update: { providerPriceId: proStripePriceId },
    create: {
      name: 'Pro',
      slug: 'pro',
      priceMinor: 4900,
      currency: 'USD',
      interval: 'month',
      trialDays: 14,
      provider: 'STRIPE',
      providerPriceId: proStripePriceId,
    },
  })
  await db.plan.upsert({
    where: { slug: 'lifetime-serial' },
    update: {
      type: 'SERIAL_KEY',
      isPermanent: true,
      provider: 'ZIBAL',
      currency: 'IRR',
    },
    create: {
      name: 'Lifetime Serial',
      slug: 'lifetime-serial',
      type: 'SERIAL_KEY',
      isPermanent: true,
      priceMinor: 9900,
      currency: 'IRR',
      interval: 'lifetime',
      trialDays: 0,
      provider: 'ZIBAL',
    },
  })

  // --- Feature flags -----------------------------------------------------
  const flagKeys = [
    'flag.advanced-analytics',
    'flag.sso',
    'flag.webhooks',
    'allow_api_access',
    'flag.priority-support',
  ]
  const flags = []
  for (const key of flagKeys) {
    const flag = await db.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, description: `Seeded flag: ${key}` },
    })
    flags.push(flag)
  }

  // --- Demo users: one account for every defined role -------------------
  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    update: { name: 'Owner', emailVerified: true },
    create: { email: ownerEmail, name: 'Owner', emailVerified: true },
  })
  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: { name: 'Admin', emailVerified: true },
    create: { email: adminEmail, name: 'Admin', emailVerified: true },
  })

  await db.account.upsert({
    where: { id: '00000000-0000-4000-8000-000000000003' },
    update: {
      accountId: owner.id,
      userId: owner.id,
      password: await bcrypt.hash(ownerPassword, 12),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000003',
      accountId: owner.id,
      providerId: 'credential',
      userId: owner.id,
      password: await bcrypt.hash(ownerPassword, 12),
    },
  })
  await db.account.upsert({
    where: { id: '00000000-0000-4000-8000-000000000004' },
    update: { password: await bcrypt.hash(adminPassword, 12) },
    create: {
      id: '00000000-0000-4000-8000-000000000004',
      accountId: admin.id,
      providerId: 'credential',
      userId: admin.id,
      password: await bcrypt.hash(adminPassword, 12),
    },
  })

  // --- Tenants + subscriptions + flags ----------------------------------
  const tenants = [
    {
      name: 'Acme Inc',
      slug: 'acme',
      plan: pro,
      enabled: ['flag.sso', 'flag.webhooks', 'allow_api_access'],
    },
    {
      name: 'Globex Corp',
      slug: 'globex',
      plan: starter,
      enabled: ['flag.advanced-analytics'],
    },
    {
      name: 'Initech LLC',
      slug: 'initech',
      plan: starter,
      enabled: ['flag.priority-support'],
    },
  ]

  const periodEnd = new Date()
  periodEnd.setDate(periodEnd.getDate() + 30)

  for (const t of tenants) {
    const tenant = await db.tenant.upsert({
      where: { slug: t.slug },
      update: {},
      create: { name: t.name, slug: t.slug },
    })

    const subscription = await db.subscription.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        planId: t.plan.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
      },
    })

    await db.invoice.upsert({
      where: { number: `seed:${t.slug}:initial` },
      update: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        amountMinor: t.plan.priceMinor,
        currency: t.plan.currency,
        status: 'PAID',
        paidAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        number: `seed:${t.slug}:initial`,
        amountMinor: t.plan.priceMinor,
        currency: t.plan.currency,
        status: 'PAID',
        paidAt: new Date(),
      },
    })

    for (const flag of flags) {
      await db.tenantFlag.upsert({
        where: { tenantId_flagId: { tenantId: tenant.id, flagId: flag.id } },
        update: { enabled: t.enabled.includes(flag.key) },
        create: {
          tenantId: tenant.id,
          flagId: flag.id,
          enabled: t.enabled.includes(flag.key),
        },
      })
    }

    await db.membership.upsert({
      where: { userId_tenantId: { userId: owner.id, tenantId: tenant.id } },
      update: {},
      create: { userId: owner.id, tenantId: tenant.id, role: 'OWNER' },
    })
    await db.membership.upsert({
      where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
      update: { role: 'ADMIN' },
      create: { userId: admin.id, tenantId: tenant.id, role: 'ADMIN' },
    })
  }

  // --- Demo service (ENTITLEMENT) ---------------------------------------
  const acme = await db.tenant.findUniqueOrThrow({ where: { slug: 'acme' } })
  await db.service.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: acme.id,
      name: 'demo-web-app',
      controlType: ServiceControlType.ENTITLEMENT,
      endpointUrl: null,
      deployStatus: ServiceDeployStatus.HEALTHY,
      paymentDeliveryMode: 'CALLBACK',
      paymentCallbackUrl: null,
      paymentCallbackSecret: null,
    },
  })

  await db.auditLog.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      tenantId: acme.id,
      actorId: owner.id,
      action: 'seed.completed',
      entityType: 'Tenant',
      entityId: acme.id,
      metadata: { source: 'prisma/seed.ts' },
    },
  })

  console.log(
    'Seed complete: 2 roles, 2 accounts, 2 plans, 5 flags, 3 tenants, 1 demo service, 1 audit log.',
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
