import { env } from '#/env'
import {
  PrismaClient,
  ServiceControlType,
  ServiceDeployStatus,
} from '#/generated/prisma/client'

import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
const db = new PrismaClient({ adapter })

async function main() {
  // --- Plans -------------------------------------------------------------
  const starter = await db.plan.upsert({
    where: { slug: 'starter' },
    update: {},
    create: {
      name: 'Starter',
      slug: 'starter',
      priceCents: 1900,
      currency: 'USD',
      interval: 'month',
      trialDays: 14,
    },
  })
  const pro = await db.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: {
      name: 'Pro',
      slug: 'pro',
      priceCents: 4900,
      currency: 'USD',
      interval: 'month',
      trialDays: 14,
    },
  })

  // --- Feature flags -----------------------------------------------------
  const flagKeys = [
    'flag.advanced-analytics',
    'flag.sso',
    'flag.webhooks',
    'flag.api-access',
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

  // --- Demo owner user ---------------------------------------------------
  const owner = await db.user.upsert({
    where: { email: 'owner@acme.test' },
    update: {},
    create: { email: 'owner@acme.test', name: 'Demo Owner' },
  })

  // --- Tenants + subscriptions + flags ----------------------------------
  const tenants = [
    {
      name: 'Acme Inc',
      slug: 'acme',
      plan: pro,
      enabled: ['flag.sso', 'flag.webhooks', 'flag.api-access'],
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

    await db.subscription.upsert({
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
  }

  // --- Demo service (ENTITLEMENT) ---------------------------------------
  const acme = await db.tenant.findUniqueOrThrow({ where: { slug: 'acme' } })
  await db.service.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: acme.id,
      name: 'Billing API',
      controlType: ServiceControlType.ENTITLEMENT,
      endpointUrl: null,
      deployStatus: ServiceDeployStatus.HEALTHY,
    },
  })

  console.log('Seed complete: 2 plans, 5 flags, 3 tenants, 1 demo service.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
