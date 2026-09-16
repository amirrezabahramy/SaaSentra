import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { db } from '#/db'
import { auth } from './auth'
import { disable, enable, getEntitlement } from './lifecycle'

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

async function actorId(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session || !session.user.id) throw new Error('Authentication required')
  return session.user.id
}

export const getSubscriptions = createServerFn({ method: 'GET' })
  .validator((data: unknown) => statusSchema.parse(data))
  .handler(async ({ data }) =>
    db.subscription.findMany({
      where: {
        deletedAt: null,
        ...(data.status ? { status: data.status } : {}),
      },
      include: { plan: true, tenant: true },
      orderBy: { updatedAt: 'desc' },
    }),
  )

export const getServices = createServerFn({ method: 'GET' }).handler(
  async () => {
    const services = await db.service.findMany({
      where: { deletedAt: null },
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
        entitlement: await getEntitlement(service.tenantId),
      })),
    )
  },
)

export const getFlags = createServerFn({ method: 'GET' }).handler(async () => {
  const [flags, tenants] = await Promise.all([
    db.featureFlag.findMany({
      where: { deletedAt: null },
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
