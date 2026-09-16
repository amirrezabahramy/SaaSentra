import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from '#/db'
import { auth } from './auth'
import {
  disable,
  enable,
  getEntitlement,
  transitionSubscription,
} from './lifecycle'

const reasonSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})
const statusSchema = z.object({
  status: z
    .enum([
      'ACTIVE',
      'PAST_DUE',
      'GRACE_PERIOD',
      'DISABLED',
      'CANCELED',
      'DISABLED_AT_PERIOD_END',
      'ARCHIVED',
      'TRIALING',
    ])
    .optional(),
})
const flagSchema = z.object({
  tenantId: z.string().uuid(),
  flagKey: z.string().min(1).max(100),
  enabled: z.boolean(),
})
const auditSchema = z.object({
  tenantId: z.string().uuid().optional(),
  action: z.string().max(120).optional(),
})
const tenantCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
})
const tenantUpdateSchema = tenantCreateSchema.extend({ id: z.string().uuid() })
const tenantArchiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})
const restoreSchema = z.object({ id: z.string().uuid() })
const serviceSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  controlType: z.enum(['ENTITLEMENT', 'TOKEN', 'WEBHOOK', 'INFRA']),
  endpointUrl: z.string().trim().url().nullable().optional(),
  deployStatus: z.enum(['HEALTHY', 'DEGRADED', 'OFFLINE']),
})
const serviceUpdateSchema = serviceSchema.extend({ id: z.string().uuid() })
const serviceArchiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})
const flagDefinitionSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_.-]+$/),
  description: z.string().trim().max(500).nullable().optional(),
})
const flagUpdateSchema = flagDefinitionSchema.extend({ id: z.string().uuid() })
const flagArchiveSchema = z.object({ id: z.string().uuid() })
const subscriptionCreateSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  periodEnd: z.coerce.date(),
})
const subscriptionUpdateSchema = subscriptionCreateSchema.extend({
  id: z.string().uuid(),
  status: z
    .enum([
      'ACTIVE',
      'PAST_DUE',
      'GRACE_PERIOD',
      'DISABLED',
      'CANCELED',
      'DISABLED_AT_PERIOD_END',
      'ARCHIVED',
      'TRIALING',
    ])
    .optional(),
  reason: z.string().trim().min(1).max(500),
})
const subscriptionArchiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

async function actorId(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session || !session.user.id) throw new Error('Authentication required')
  return session.user.id
}

async function createAudit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  data: {
    tenantId: string
    actorId: string
    action: string
    entityType: string
    entityId: string
    reason: string
    metadata?: Record<string, unknown>
  },
) {
  return tx.auditLog.create({
    data: {
      tenantId: data.tenantId,
      actorId: data.actorId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: { reason: data.reason, ...data.metadata },
    },
  })
}

async function createGlobalFlagAudits(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  data: {
    actorId: string
    action: string
    entityId: string
    reason: string
  },
) {
  const tenants = await tx.tenant.findMany({
    where: { deletedAt: null },
    select: { id: true },
  })
  if (tenants.length === 0) return
  await tx.auditLog.createMany({
    data: tenants.map((tenant) => ({
      tenantId: tenant.id,
      actorId: data.actorId,
      action: data.action,
      entityType: 'FeatureFlag',
      entityId: data.entityId,
      metadata: { reason: data.reason },
    })),
  })
}

export const createTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => tenantCreateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data })
      await createAudit(tx, {
        tenantId: tenant.id,
        actorId: actor,
        action: 'tenant.created',
        entityType: 'Tenant',
        entityId: tenant.id,
        reason: 'Tenant created by operator',
      })
      return tenant
    })
  })

export const updateTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => tenantUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: data.id, deletedAt: null },
        data: { name: data.name, slug: data.slug },
      })
      await createAudit(tx, {
        tenantId: tenant.id,
        actorId: actor,
        action: 'tenant.updated',
        entityType: 'Tenant',
        entityId: tenant.id,
        reason: 'Tenant details updated by operator',
      })
      return tenant
    })
  })

export const archiveTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => tenantArchiveSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: data.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await createAudit(tx, {
        tenantId: tenant.id,
        actorId: actor,
        action: 'tenant.archived',
        entityType: 'Tenant',
        entityId: tenant.id,
        reason: data.reason,
      })
      return tenant
    })
  })

export const unarchiveTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: data.id },
        data: { deletedAt: null },
      })
      const subscription = await tx.subscription.findUnique({
        where: { tenantId: tenant.id },
      })
      if (subscription?.status === 'ARCHIVED') {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { deletedAt: null, status: 'DISABLED' },
        })
      }
      await createAudit(tx, {
        tenantId: tenant.id,
        actorId: actor,
        action: 'tenant.unarchived',
        entityType: 'Tenant',
        entityId: tenant.id,
        reason: 'Tenant restored by operator',
      })
      return tenant
    })
  })

export const permanentlyDeleteTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: data.id, deletedAt: { not: null } },
      })
      await tx.auditLog.deleteMany({ where: { tenantId: tenant.id } })
      await tx.payment.deleteMany({ where: { tenantId: tenant.id } })
      await tx.invoice.deleteMany({ where: { tenantId: tenant.id } })
      await tx.serviceAction.deleteMany({ where: { tenantId: tenant.id } })
      await tx.membership.deleteMany({ where: { tenantId: tenant.id } })
      await tx.tenantFlag.deleteMany({ where: { tenantId: tenant.id } })
      await tx.service.deleteMany({ where: { tenantId: tenant.id } })
      await tx.subscription.deleteMany({ where: { tenantId: tenant.id } })
      await tx.tenant.delete({ where: { id: tenant.id } })
      return { id: tenant.id, actorId: actor }
    })
  })

export const createService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          ...data,
          endpointUrl: data.endpointUrl ?? null,
        },
      })
      await createAudit(tx, {
        tenantId: service.tenantId,
        actorId: actor,
        action: 'service.created',
        entityType: 'Service',
        entityId: service.id,
        reason: 'Service created by operator',
      })
      return service
    })
  })

export const updateService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id: data.id, deletedAt: null },
        data: {
          tenantId: data.tenantId,
          name: data.name,
          controlType: data.controlType,
          endpointUrl: data.endpointUrl ?? null,
          deployStatus: data.deployStatus,
        },
      })
      await createAudit(tx, {
        tenantId: service.tenantId,
        actorId: actor,
        action: 'service.updated',
        entityType: 'Service',
        entityId: service.id,
        reason: 'Service updated by operator',
      })
      return service
    })
  })

export const archiveService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceArchiveSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id: data.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await createAudit(tx, {
        tenantId: service.tenantId,
        actorId: actor,
        action: 'service.archived',
        entityType: 'Service',
        entityId: service.id,
        reason: data.reason,
      })
      return service
    })
  })

export const unarchiveService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const service = await tx.service.update({
        where: { id: data.id },
        data: { deletedAt: null },
      })
      await createAudit(tx, {
        tenantId: service.tenantId,
        actorId: actor,
        action: 'service.unarchived',
        entityType: 'Service',
        entityId: service.id,
        reason: 'Service restored by operator',
      })
      return service
    })
  })

export const permanentlyDeleteService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const service = await tx.service.findUniqueOrThrow({
        where: { id: data.id, deletedAt: { not: null } },
      })
      await tx.serviceAction.deleteMany({ where: { serviceId: service.id } })
      await tx.service.delete({ where: { id: service.id } })
      return { id: service.id, actorId: actor }
    })
  })

export const createFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => flagDefinitionSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const flag = await tx.featureFlag.create({
        data: { key: data.key, description: data.description ?? null },
      })
      await createGlobalFlagAudits(tx, {
        actorId: actor,
        action: 'flag.created',
        entityId: flag.id,
        reason: 'Feature flag created by operator',
      })
      return flag
    })
  })

export const updateFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => flagUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const flag = await tx.featureFlag.update({
        where: { id: data.id, deletedAt: null },
        data: { key: data.key, description: data.description ?? null },
      })
      await createGlobalFlagAudits(tx, {
        actorId: actor,
        action: 'flag.updated',
        entityId: flag.id,
        reason: 'Feature flag updated by operator',
      })
      return flag
    })
  })

export const archiveFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => flagArchiveSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const flag = await tx.featureFlag.update({
        where: { id: data.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await createGlobalFlagAudits(tx, {
        actorId: actor,
        action: 'flag.archived',
        entityId: flag.id,
        reason: 'Feature flag archived by operator',
      })
      return flag
    })
  })

export const unarchiveFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const flag = await tx.featureFlag.update({
        where: { id: data.id },
        data: { deletedAt: null },
      })
      await createGlobalFlagAudits(tx, {
        actorId: actor,
        action: 'flag.unarchived',
        entityId: flag.id,
        reason: 'Feature flag restored by operator',
      })
      return flag
    })
  })

export const permanentlyDeleteFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const flag = await tx.featureFlag.findUniqueOrThrow({
        where: { id: data.id, deletedAt: { not: null } },
      })
      await tx.tenantFlag.deleteMany({ where: { flagId: flag.id } })
      await tx.featureFlag.delete({ where: { id: flag.id } })
      return { id: flag.id, actorId: actor }
    })
  })

export const getPlans = createServerFn({ method: 'GET' }).handler(async () =>
  db.plan.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } }),
)

export const createSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => subscriptionCreateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { tenantId: data.tenantId },
      })
      if (existing) {
        if (!existing.deletedAt) {
          throw new Error('This tenant already has a subscription')
        }
        const restored = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            planId: data.planId,
            currentPeriodEnd: data.periodEnd,
            deletedAt: null,
            status: 'TRIALING',
          },
        })
        await createAudit(tx, {
          tenantId: restored.tenantId,
          actorId: actor,
          action: 'subscription.created',
          entityType: 'Subscription',
          entityId: restored.id,
          reason: 'Archived subscription recreated by operator',
        })
        return restored
      }
      const subscription = await tx.subscription.create({
        data: {
          tenantId: data.tenantId,
          planId: data.planId,
          currentPeriodEnd: data.periodEnd,
        },
      })
      await createAudit(tx, {
        tenantId: subscription.tenantId,
        actorId: actor,
        action: 'subscription.created',
        entityType: 'Subscription',
        entityId: subscription.id,
        reason: 'Subscription created by operator',
      })
      return subscription
    })
  })

export const updateSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => subscriptionUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    const current = await db.subscription.findUniqueOrThrow({
      where: { id: data.id, deletedAt: null },
    })
    if (data.tenantId !== current.tenantId) {
      const existing = await db.subscription.findUnique({
        where: { tenantId: data.tenantId },
      })
      if (existing && existing.id !== current.id) {
        throw new Error('This tenant already has a subscription')
      }
    }
    const targetStatus = data.status
    if (targetStatus && targetStatus !== current.status) {
      await transitionSubscription(data.id, targetStatus, {
        actorId: actor,
        reason: data.reason,
      })
    }
    return db.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: data.id, deletedAt: null },
        data: {
          tenantId: data.tenantId,
          planId: data.planId,
          currentPeriodEnd: data.periodEnd,
        },
      })
      if (!targetStatus || targetStatus === current.status) {
        await createAudit(tx, {
          tenantId: subscription.tenantId,
          actorId: actor,
          action: 'subscription.updated',
          entityType: 'Subscription',
          entityId: subscription.id,
          reason: data.reason,
        })
      }
      return subscription
    })
  })

export const archiveSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => subscriptionArchiveSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    const current = await db.subscription.findUniqueOrThrow({
      where: { id: data.id, deletedAt: null },
    })
    if (!['DISABLED', 'ARCHIVED'].includes(current.status)) {
      throw new Error('Only disabled subscriptions can be archived')
    }
    if (current.status === 'DISABLED') {
      await transitionSubscription(data.id, 'ARCHIVED', {
        actorId: actor,
        reason: data.reason,
      })
    }
    return db.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: data.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await createAudit(tx, {
        tenantId: subscription.tenantId,
        actorId: actor,
        action: 'subscription.archived',
        entityType: 'Subscription',
        entityId: subscription.id,
        reason: data.reason,
      })
      return subscription
    })
  })

export const unarchiveSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { id: data.id },
        data: { deletedAt: null, status: 'DISABLED' },
      })
      await createAudit(tx, {
        tenantId: subscription.tenantId,
        actorId: actor,
        action: 'subscription.unarchived',
        entityType: 'Subscription',
        entityId: subscription.id,
        reason: 'Subscription restored by operator',
      })
      return subscription
    })
  })

export const permanentlyDeleteSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: data.id, deletedAt: { not: null } },
      })
      const invoices = await tx.invoice.findMany({
        where: { subscriptionId: subscription.id },
        select: { id: true },
      })
      await tx.payment.deleteMany({
        where: { invoiceId: { in: invoices.map((invoice) => invoice.id) } },
      })
      await tx.invoice.deleteMany({
        where: { subscriptionId: subscription.id },
      })
      await tx.subscription.delete({ where: { id: subscription.id } })
      return { id: subscription.id, actorId: actor }
    })
  })

export const getSubscriptions = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    statusSchema
      .extend({ includeArchived: z.boolean().optional() })
      .parse(data),
  )
  .handler(async ({ data }) =>
    db.subscription.findMany({
      where: {
        ...(data.includeArchived ? {} : { deletedAt: null }),
        ...(data.status ? { status: data.status } : {}),
      },
      include: { plan: true, tenant: true },
      orderBy: { updatedAt: 'desc' },
    }),
  )

export const getServices = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const services = await db.service.findMany({
      where: data.includeArchived ? {} : { deletedAt: null },
      include: { tenant: true },
      orderBy: { name: 'asc' },
    })
    return Promise.all(
      services.map(async (service) => ({
        id: service.id,
        name: service.name,
        controlType: service.controlType,
        deployStatus: service.deployStatus,
        tenantId: service.tenantId,
        tenantName: service.tenant.name,
        archived: Boolean(service.deletedAt),
        entitlement: await getEntitlement(service.tenantId),
      })),
    )
  })

export const getFlags = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const [flags, tenants] = await Promise.all([
      db.featureFlag.findMany({
        where: data.includeArchived ? {} : { deletedAt: null },
        orderBy: { key: 'asc' },
        include: { tenantFlags: true },
      }),
      db.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ])
    return {
      flags: flags.map((flag) => ({
        id: flag.id,
        key: flag.key,
        description: flag.description,
        archived: Boolean(flag.deletedAt),
        overrides: flag.tenantFlags.map((override) => ({
          tenantId: override.tenantId,
          enabled: override.enabled,
        })),
      })),
      tenants,
    }
  })

export const getAudit = createServerFn({ method: 'GET' })
  .validator((data: unknown) => auditSchema.parse(data))
  .handler(async ({ data }) =>
    db.auditLog.findMany({
      where: {
        ...(data.tenantId ? { tenantId: data.tenantId } : {}),
        ...(data.action
          ? { action: { contains: data.action, mode: 'insensitive' } }
          : {}),
      },
      include: {
        tenant: { select: { id: true, name: true } },
        actor: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  )

export const getSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const members = await db.membership.findMany({
      where: { deletedAt: null },
      include: {
        user: { select: { name: true, email: true } },
        tenant: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return {
      members: members.map((member) => ({
        id: member.id,
        role: member.role,
        user: member.user,
        tenant: member.tenant,
      })),
      env: [
        'DATABASE_URL',
        'BETTER_AUTH_SECRET',
        'BETTER_AUTH_URL',
        'ENTITLEMENT_SHARED_SECRET',
        'SERVICE_SECRET',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
      ].map((name) => ({ name, configured: Boolean(process.env[name]) })),
    }
  },
)

export const disableSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => reasonSchema.parse(data))
  .handler(async ({ data }) =>
    disable(data.subscriptionId, data.reason, { actorId: await actorId() }),
  )
export const enableSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => reasonSchema.parse(data))
  .handler(async ({ data }) =>
    enable(data.subscriptionId, {
      actorId: await actorId(),
      reason: data.reason,
    }),
  )

export const toggleTenantFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => flagSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    const flag = await db.featureFlag.findUniqueOrThrow({
      where: { key: data.flagKey },
    })
    const result = await db.$transaction(async (tx) => {
      const override = await tx.tenantFlag.upsert({
        where: {
          tenantId_flagId: { tenantId: data.tenantId, flagId: flag.id },
        },
        create: {
          tenantId: data.tenantId,
          flagId: flag.id,
          enabled: data.enabled,
        },
        update: { enabled: data.enabled },
      })
      await tx.auditLog.create({
        data: {
          tenantId: data.tenantId,
          actorId: actor,
          action: 'tenant.flag.toggled',
          entityType: 'TenantFlag',
          entityId: override.id,
          metadata: {
            flagKey: data.flagKey,
            enabled: data.enabled,
            reason: 'Admin flag override changed',
          },
        },
      })
      return override
    })
    return result
  })
