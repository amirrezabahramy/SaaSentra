import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { requireOperator } from './authorization'
import {
  disable,
  enable,
  generateSerialKey,
  transitionSubscription,
} from './lifecycle'
import { isEmailConfigured } from './email'
import { parseExternalUrl } from './external-url'
import { generateServiceApiKey, hashServiceApiKey } from './service-credentials'

const reasonSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
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
const auditSchema = z.object({
  tenantId: z.string().trim().max(100).optional(),
  action: z.string().max(120).optional(),
})
const optionalEmailSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.string().trim().email().max(320).nullable().optional(),
)
const tenantCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  billingEmail: optionalEmailSchema,
})
const tenantUpdateSchema = tenantCreateSchema.extend({ id: z.string().uuid() })
const tenantArchiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})
const restoreSchema = z.object({ id: z.string().uuid() })
const serviceFlagInputSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_.-]+$/),
  description: z.string().trim().max(500).nullable().optional(),
})
const serviceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    flags: z.array(serviceFlagInputSchema).default([]),
  })
  .superRefine((value, context) => {
    const keys = new Set<string>()
    for (const flag of value.flags) {
      if (keys.has(flag.key)) {
        context.addIssue({
          code: 'custom',
          path: ['flags'],
          message: `Duplicate service flag: ${flag.key}`,
        })
      }
      keys.add(flag.key)
    }
  })
const serviceUpdateSchema = serviceSchema.extend({ id: z.string().uuid() })
const tenantServiceConfigSchema = z.object({
  serviceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  deployStatus: z.enum(['HEALTHY', 'DEGRADED', 'OFFLINE']),
  paymentCallbackUrl: z.string().trim().url().nullable().optional(),
  paymentCallbackSecret: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
  paymentDeliveryMode: z.enum(['CALLBACK', 'EMAIL', 'CALLBACK_AND_EMAIL']),
})
const serviceArchiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

async function assertTenantServiceDeliveryConfigured(
  mode: 'CALLBACK' | 'EMAIL' | 'CALLBACK_AND_EMAIL',
  callbackUrl?: string | null,
  callbackSecret?: string | null,
) {
  if (mode !== 'CALLBACK' && !isEmailConfigured()) {
    throw new Error('SMTP email delivery is not configured')
  }
  if (mode !== 'EMAIL') {
    if (!callbackUrl || !callbackSecret) {
      throw new Error('Payment callback URL and secret are required')
    }
    await parseExternalUrl(callbackUrl)
  }
}

const planSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    type: z.enum(['SUBSCRIPTION', 'SERIAL_KEY']),
    isPermanent: z.boolean(),
    priceMinor: z.coerce.number().int().nonnegative(),
    currency: z.enum(['USD', 'IRR']),
    interval: z
      .string()
      .trim()
      .regex(/^(?:\d+\s*days?|permanent|lifetime)$/i),
    trialDays: z.coerce.number().int().nonnegative(),
    provider: z.enum(['STRIPE', 'ZIBAL']),
    providerPriceId: z.string().trim().max(120).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.provider === 'ZIBAL' && value.currency !== 'IRR') {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Zibal plans must use IRR currency',
      })
    }
    if (value.provider === 'STRIPE' && value.currency !== 'USD') {
      context.addIssue({
        code: 'custom',
        path: ['currency'],
        message: 'Stripe plans must use USD currency',
      })
    }
    if (value.provider === 'ZIBAL' && value.providerPriceId) {
      context.addIssue({
        code: 'custom',
        path: ['providerPriceId'],
        message: 'Zibal plans do not use a provider price ID',
      })
    }
    if (value.provider === 'STRIPE' && !value.providerPriceId) {
      context.addIssue({
        code: 'custom',
        path: ['providerPriceId'],
        message: 'Stripe plans require a provider price ID',
      })
    }
  })
const planUpdateSchema = planSchema.extend({ id: z.string().uuid() })
const subscriptionCreateSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().nullable().optional(),
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
  reason: z.string().trim().max(500).optional(),
})
const subscriptionArchiveSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

const permanentPeriodEnd = new Date('9999-12-31T23:59:59.999Z')

function periodEndForPlan(start: Date, interval: string, isPermanent: boolean) {
  if (isPermanent) return permanentPeriodEnd
  const match = interval.match(/^(\d+)?\s*(day|week|month|year)s?$/i)
  if (!match) return null
  const end = new Date(start)
  const count = Number(match[1] || 1)
  const unit = match[2].toLowerCase()
  if (unit === 'day') end.setDate(end.getDate() + count)
  if (unit === 'week') end.setDate(end.getDate() + count * 7)
  if (unit === 'month') end.setMonth(end.getMonth() + count)
  if (unit === 'year') end.setFullYear(end.getFullYear() + count)
  return end
}

function initialPeriodForPlan(
  start: Date,
  plan: { interval: string; isPermanent: boolean; trialDays: number },
) {
  if (!plan.isPermanent && plan.trialDays > 0) {
    const trialEnd = new Date(start)
    trialEnd.setDate(trialEnd.getDate() + plan.trialDays)
    return trialEnd
  }
  return (
    periodEndForPlan(start, plan.interval, plan.isPermanent) ??
    (plan.isPermanent ? permanentPeriodEnd : null)
  )
}

async function actorId(): Promise<string> {
  return requireOperator()
}

async function createAudit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  data: {
    tenantId?: string
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

async function createGlobalAudits(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  data: {
    actorId: string
    action: string
    entityId: string
    reason: string
    entityType?: string
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
      entityType: data.entityType ?? 'System',
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
        data: {
          name: data.name,
          slug: data.slug,
          billingEmail: data.billingEmail,
        },
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
      await tx.tenantService.deleteMany({ where: { tenantId: tenant.id } })
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
      const { flags } = data
      const service = await tx.service.create({
        data: { name: data.name },
      })
      await tx.serviceFlag.createMany({
        data: flags.map((flag) => ({
          serviceId: service.id,
          key: flag.key,
          description: flag.description ?? null,
        })),
      })
      await createAudit(tx, {
        actorId: actor,
        action: 'service.created',
        entityType: 'Service',
        entityId: service.id,
        reason: 'Service created by operator',
      })
      return { service }
    })
  })

export const updateService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const current = await tx.service.findUniqueOrThrow({
        where: { id: data.id, deletedAt: null },
        include: {
          flagDefinitions: true,
          tenantAssignments: {
            include: { flags: true },
          },
        },
      })
      const incomingKeys = new Set(data.flags.map((flag) => flag.key))
      const removedFlags = current.flagDefinitions.filter(
        (flag) => !incomingKeys.has(flag.key),
      )
      const blockedFlag = removedFlags.find((flag) =>
        current.tenantAssignments.some((assignment) =>
          assignment.flags.some(
            (assignedFlag) =>
              assignedFlag.serviceFlagId === flag.id && assignedFlag.enabled,
          ),
        ),
      )
      if (blockedFlag) {
        throw new Error(
          `Flag ${blockedFlag.key} is enabled for a tenant and cannot be removed`,
        )
      }
      const service = await tx.service.update({
        where: { id: data.id, deletedAt: null },
        data: { name: data.name },
      })
      for (const flag of data.flags) {
        await tx.serviceFlag.upsert({
          where: { serviceId_key: { serviceId: service.id, key: flag.key } },
          update: {
            description: flag.description ?? null,
            deletedAt: null,
          },
          create: {
            serviceId: service.id,
            key: flag.key,
            description: flag.description ?? null,
          },
        })
      }
      for (const flag of removedFlags) {
        await tx.serviceFlag.delete({ where: { id: flag.id } })
      }
      await createAudit(tx, {
        actorId: actor,
        action: 'service.updated',
        entityType: 'Service',
        entityId: service.id,
        reason: 'Service updated by operator',
      })
      return service
    })
  })

export const rotateTenantServiceApiKey = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceAssignmentSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    const serviceApiKey = generateServiceApiKey()
    return db.$transaction(async (tx) => {
      const assignment = await tx.tenantService.update({
        where: {
          tenantId_serviceId: {
            tenantId: data.tenantId,
            serviceId: data.serviceId,
          },
        },
        data: {
          serviceApiKeyHash: await hashServiceApiKey(serviceApiKey),
          serviceApiKeyLastFour: serviceApiKey.slice(-4),
          serviceApiKeyCreatedAt: new Date(),
          serviceApiKeyRevokedAt: null,
        },
      })
      await createAudit(tx, {
        tenantId: data.tenantId,
        actorId: actor,
        action: 'tenant_service.api_key_rotated',
        entityType: 'TenantService',
        entityId: assignment.id,
        reason: 'Tenant service API key rotated by operator',
      })
      return { assignment, apiKey: serviceApiKey }
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

const serviceAssignmentSchema = z.object({
  serviceId: z.string().uuid(),
  tenantId: z.string().uuid(),
})
const serviceFlagToggleSchema = serviceAssignmentSchema.extend({
  serviceFlagId: z.string().uuid(),
  enabled: z.boolean(),
})

export const assignServiceToTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceAssignmentSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const service = await tx.service.findUniqueOrThrow({
        where: { id: data.serviceId, deletedAt: null },
        include: { flagDefinitions: { where: { deletedAt: null } } },
      })
      await tx.tenant.findUniqueOrThrow({
        where: { id: data.tenantId, deletedAt: null },
      })
      const existingAssignment = await tx.tenantService.findUnique({
        where: {
          tenantId_serviceId: {
            tenantId: data.tenantId,
            serviceId: data.serviceId,
          },
        },
      })
      const apiKey = existingAssignment?.serviceApiKeyHash
        ? null
        : generateServiceApiKey()
      const assignment = await tx.tenantService.upsert({
        where: {
          tenantId_serviceId: {
            tenantId: data.tenantId,
            serviceId: data.serviceId,
          },
        },
        update: apiKey
          ? {
              serviceApiKeyHash: await hashServiceApiKey(apiKey),
              serviceApiKeyLastFour: apiKey.slice(-4),
              serviceApiKeyCreatedAt: new Date(),
              serviceApiKeyRevokedAt: null,
            }
          : {},
        create: {
          tenantId: data.tenantId,
          serviceId: data.serviceId,
          serviceApiKeyHash: apiKey ? await hashServiceApiKey(apiKey) : null,
          serviceApiKeyLastFour: apiKey ? apiKey.slice(-4) : null,
          serviceApiKeyCreatedAt: apiKey ? new Date() : null,
        },
      })
      await tx.tenantServiceFlag.createMany({
        data: service.flagDefinitions.map((flag) => ({
          tenantServiceId: assignment.id,
          serviceFlagId: flag.id,
          enabled: false,
        })),
        skipDuplicates: true,
      })
      await createAudit(tx, {
        tenantId: data.tenantId,
        actorId: actor,
        action: 'service.assigned',
        entityType: 'TenantService',
        entityId: assignment.id,
        reason: 'Service assigned to tenant by operator',
      })
      return {
        assignment,
        apiKey,
      }
    })
  })

export const updateTenantService = createServerFn({ method: 'POST' })
  .validator((data: unknown) => tenantServiceConfigSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    const existing = await db.tenantService.findUniqueOrThrow({
      where: {
        tenantId_serviceId: {
          tenantId: data.tenantId,
          serviceId: data.serviceId,
        },
      },
      select: { paymentCallbackSecret: true },
    })
    await assertTenantServiceDeliveryConfigured(
      data.paymentDeliveryMode,
      data.paymentCallbackUrl,
      data.paymentCallbackSecret ?? existing.paymentCallbackSecret,
    )
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: data.tenantId, deletedAt: null },
      select: { billingEmail: true },
    })
    if (data.paymentDeliveryMode !== 'CALLBACK' && !tenant.billingEmail) {
      throw new Error(
        'This service requires a billing email before email delivery can be enabled',
      )
    }
    return db.$transaction(async (tx) => {
      const assignment = await tx.tenantService.update({
        where: {
          tenantId_serviceId: {
            tenantId: data.tenantId,
            serviceId: data.serviceId,
          },
        },
        data: {
          deployStatus: data.deployStatus,
          paymentCallbackUrl: data.paymentCallbackUrl ?? null,
          ...(data.paymentCallbackSecret
            ? { paymentCallbackSecret: data.paymentCallbackSecret }
            : {}),
          paymentDeliveryMode: data.paymentDeliveryMode,
        },
      })
      await createAudit(tx, {
        tenantId: data.tenantId,
        actorId: actor,
        action: 'tenant_service.updated',
        entityType: 'TenantService',
        entityId: assignment.id,
        reason: 'Tenant service configuration updated by operator',
      })
      return assignment
    })
  })

export const unassignServiceFromTenant = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceAssignmentSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const assignment = await tx.tenantService.findUniqueOrThrow({
        where: {
          tenantId_serviceId: {
            tenantId: data.tenantId,
            serviceId: data.serviceId,
          },
        },
      })
      await tx.tenantService.delete({ where: { id: assignment.id } })
      await createAudit(tx, {
        tenantId: data.tenantId,
        actorId: actor,
        action: 'service.unassigned',
        entityType: 'TenantService',
        entityId: assignment.id,
        reason: 'Service unassigned from tenant by operator',
      })
      return { id: assignment.id }
    })
  })

export const toggleTenantServiceFlag = createServerFn({ method: 'POST' })
  .validator((data: unknown) => serviceFlagToggleSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const assignment = await tx.tenantService.findUniqueOrThrow({
        where: {
          tenantId_serviceId: {
            tenantId: data.tenantId,
            serviceId: data.serviceId,
          },
        },
      })
      const flag = await tx.serviceFlag.findUniqueOrThrow({
        where: { id: data.serviceFlagId, deletedAt: null },
      })
      if (flag.serviceId !== data.serviceId) {
        throw new Error('Service flag does not belong to service')
      }
      const override = await tx.tenantServiceFlag.upsert({
        where: {
          tenantServiceId_serviceFlagId: {
            tenantServiceId: assignment.id,
            serviceFlagId: flag.id,
          },
        },
        create: {
          tenantServiceId: assignment.id,
          serviceFlagId: flag.id,
          enabled: data.enabled,
        },
        update: { enabled: data.enabled },
      })
      await createAudit(tx, {
        tenantId: data.tenantId,
        actorId: actor,
        action: 'service.flag.toggled',
        entityType: 'TenantServiceFlag',
        entityId: override.id,
        reason: 'Service flag access changed by operator',
        metadata: {
          serviceId: data.serviceId,
          flagKey: flag.key,
          enabled: data.enabled,
        },
      })
      return override
    })
  })

export const createPlan = createServerFn({ method: 'POST' })
  .validator((data: unknown) => planSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: { ...data, providerPriceId: data.providerPriceId ?? null },
      })
      await createGlobalAudits(tx, {
        actorId: actor,
        action: 'plan.created',
        entityId: plan.id,
        entityType: 'Plan',
        reason: 'Plan created by operator',
      })
      return plan
    })
  })

export const updatePlan = createServerFn({ method: 'POST' })
  .validator((data: unknown) => planUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id: data.id, deletedAt: null },
        data: {
          name: data.name,
          slug: data.slug,
          type: data.type,
          isPermanent: data.isPermanent,
          priceMinor: data.priceMinor,
          currency: data.currency,
          interval: data.interval,
          trialDays: data.trialDays,
          provider: data.provider,
          providerPriceId: data.providerPriceId ?? null,
        },
      })
      await createGlobalAudits(tx, {
        actorId: actor,
        action: 'plan.updated',
        entityId: plan.id,
        entityType: 'Plan',
        reason: 'Plan updated by operator',
      })
      return plan
    })
  })

export const archivePlan = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const subscriptionCount = await tx.subscription.count({
        where: { planId: data.id },
      })
      if (subscriptionCount > 0) {
        throw new Error('Plans used by subscriptions cannot be archived')
      }
      const plan = await tx.plan.update({
        where: { id: data.id, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      await createGlobalAudits(tx, {
        actorId: actor,
        action: 'plan.archived',
        entityId: plan.id,
        entityType: 'Plan',
        reason: 'Plan archived by operator',
      })
      return plan
    })
  })

export const unarchivePlan = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id: data.id },
        data: { deletedAt: null },
      })
      await createGlobalAudits(tx, {
        actorId: actor,
        action: 'plan.unarchived',
        entityId: plan.id,
        entityType: 'Plan',
        reason: 'Plan restored by operator',
      })
      return plan
    })
  })

export const permanentlyDeletePlan = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const plan = await tx.plan.findUniqueOrThrow({
        where: { id: data.id, deletedAt: { not: null } },
      })
      const subscriptions = await tx.subscription.findMany({
        where: { planId: plan.id },
        select: { id: true },
      })
      if (subscriptions.length > 0) {
        throw new Error('Plans used by subscriptions cannot be deleted')
      }
      await tx.plan.delete({ where: { id: plan.id } })
      return { id: plan.id, actorId: actor }
    })
  })

export const getPlans = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireOperator()
    return db.plan
      .findMany({
        where: data.includeArchived ? {} : { deletedAt: null },
        orderBy: { name: 'asc' },
        include: { _count: { select: { subscriptions: true } } },
      })
      .then((plans) =>
        plans.map(({ _count, ...plan }) => ({
          ...plan,
          subscriptionCount: _count.subscriptions,
        })),
      )
  })

export const createSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => subscriptionCreateSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const plan = await tx.plan.findUniqueOrThrow({
        where: { id: data.planId },
      })
      const periodStart = data.periodStart ?? new Date()
      const periodEnd =
        initialPeriodForPlan(periodStart, plan) ?? data.periodEnd
      if (!periodEnd) throw new Error('Period end is required for this plan')
      const initialStatus =
        !plan.isPermanent && plan.trialDays > 0 ? 'TRIALING' : 'ACTIVE'
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
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            deletedAt: null,
            status: initialStatus,
            serialKey: plan.type === 'SERIAL_KEY' ? generateSerialKey() : null,
            submittedSerialKey: null,
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
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: initialStatus,
          serialKey: plan.type === 'SERIAL_KEY' ? generateSerialKey() : null,
          submittedSerialKey: null,
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
      include: { plan: true },
    })
    if (data.status === 'ARCHIVED') {
      throw new Error('Subscriptions must be archived with the archive action')
    }
    const targetPlan = await db.plan.findUniqueOrThrow({
      where: { id: data.planId },
    })
    if (data.status === 'CANCELED' && targetPlan.isPermanent) {
      throw new Error('Permanent subscriptions cannot be canceled')
    }
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
      const plan = targetPlan
      const periodStart = data.periodStart ?? current.currentPeriodStart
      const periodEnd =
        periodEndForPlan(periodStart, plan.interval, plan.isPermanent) ??
        (plan.isPermanent ? permanentPeriodEnd : data.periodEnd)
      if (!periodEnd) throw new Error('Period end is required for this plan')
      const subscription = await tx.subscription.update({
        where: { id: data.id, deletedAt: null },
        data: {
          tenantId: data.tenantId,
          planId: data.planId,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          serialKey:
            plan.type === 'SERIAL_KEY'
              ? current.plan.type === 'SERIAL_KEY' &&
                current.planId === data.planId
                ? current.serialKey
                : generateSerialKey()
              : null,
          submittedSerialKey:
            plan.type === 'SERIAL_KEY' &&
            current.plan.type === 'SERIAL_KEY' &&
            current.planId === data.planId
              ? current.submittedSerialKey
              : null,
        },
      })
      if (!targetStatus || targetStatus === current.status) {
        await createAudit(tx, {
          tenantId: subscription.tenantId,
          actorId: actor,
          action: 'subscription.updated',
          entityType: 'Subscription',
          entityId: subscription.id,
          reason: data.reason ?? 'Subscription updated by operator',
        })
      }
      return subscription
    })
  })

export const regenerateSerialKey = createServerFn({ method: 'POST' })
  .validator((data: unknown) => restoreSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    return db.$transaction(async (tx) => {
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: data.id, deletedAt: null },
        include: { plan: true },
      })
      if (subscription.plan.type !== 'SERIAL_KEY') {
        throw new Error('Only serial-key plans can regenerate a serial key')
      }
      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          serialKey: generateSerialKey(),
          submittedSerialKey: null,
        },
      })
      await createAudit(tx, {
        tenantId: subscription.tenantId,
        actorId: actor,
        action: 'subscription.serial_key_regenerated',
        entityType: 'Subscription',
        entityId: subscription.id,
        reason: 'Serial key regenerated by operator',
      })
      return updated
    })
  })

export const archiveSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) => subscriptionArchiveSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await actorId()
    const current = await db.subscription.findUniqueOrThrow({
      where: { id: data.id, deletedAt: null },
    })
    if (!['DISABLED', 'CANCELED', 'ARCHIVED'].includes(current.status)) {
      throw new Error('Only disabled or canceled subscriptions can be archived')
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
      const current = await tx.subscription.findUniqueOrThrow({
        where: { id: data.id },
      })
      if (current.status === 'CANCELED') {
        throw new Error('Canceled subscriptions cannot be restored')
      }
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
  .handler(async ({ data }) => {
    await requireOperator()
    return db.subscription.findMany({
      where: {
        ...(data.includeArchived ? {} : { deletedAt: null }),
        ...(data.status ? { status: data.status } : {}),
      },
      include: { plan: true, tenant: true },
      orderBy: { updatedAt: 'desc' },
    })
  })

export const getServices = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireOperator()
    const services = await db.service.findMany({
      where: data.includeArchived ? {} : { deletedAt: null },
      include: {
        flagDefinitions: {
          where: data.includeArchived ? {} : { deletedAt: null },
          orderBy: { key: 'asc' },
        },
        tenantAssignments: {
          include: {
            tenant: { select: { id: true, name: true, billingEmail: true } },
            flags: {
              include: { serviceFlag: true },
              orderBy: { serviceFlag: { key: 'asc' } },
            },
          },
          orderBy: { tenant: { name: 'asc' } },
        },
        paymentCheckouts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { delivery: true },
        },
      },
      orderBy: { name: 'asc' },
    })
    return services.map((service) => ({
      id: service.id,
      name: service.name,
      emailDeliveryAvailable: isEmailConfigured(),
      paymentDelivery: service.paymentCheckouts[0]?.delivery
        ? {
            status: service.paymentCheckouts[0].delivery.status,
            attempts: service.paymentCheckouts[0].delivery.attempts,
            lastError: service.paymentCheckouts[0].delivery.lastError,
            deliveredAt:
              service.paymentCheckouts[0].delivery.deliveredAt?.toISOString() ??
              null,
          }
        : null,
      archived: Boolean(service.deletedAt),
      flags: service.flagDefinitions.map((flag) => ({
        id: flag.id,
        key: flag.key,
        description: flag.description,
        archived: Boolean(flag.deletedAt),
      })),
      assignments: service.tenantAssignments.map((assignment) => ({
        id: assignment.id,
        tenantId: assignment.tenant.id,
        tenantName: assignment.tenant.name,
        billingEmail: assignment.tenant.billingEmail,
        deployStatus: assignment.deployStatus,
        paymentCallbackUrl: assignment.paymentCallbackUrl,
        paymentDeliveryMode: assignment.paymentDeliveryMode,
        serviceApiKeyLastFour: assignment.serviceApiKeyLastFour,
        flags: assignment.flags.map((flag) => ({
          serviceFlagId: flag.serviceFlagId,
          enabled: flag.enabled,
        })),
      })),
    }))
  })

export const getFlags = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireOperator()
    const [services, tenants] = await Promise.all([
      db.service.findMany({
        where: data.includeArchived ? {} : { deletedAt: null },
        orderBy: { name: 'asc' },
        include: {
          flagDefinitions: {
            where: data.includeArchived ? {} : { deletedAt: null },
            orderBy: { key: 'asc' },
          },
          tenantAssignments: {
            include: {
              tenant: { select: { id: true, name: true, billingEmail: true } },
              flags: true,
            },
            orderBy: { tenant: { name: 'asc' } },
          },
        },
      }),
      db.tenant.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ])
    return {
      emailDeliveryAvailable: isEmailConfigured(),
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        archived: Boolean(service.deletedAt),
        flags: service.flagDefinitions.map((flag) => ({
          id: flag.id,
          key: flag.key,
          description: flag.description,
          archived: Boolean(flag.deletedAt),
        })),
        assignments: service.tenantAssignments.map((assignment) => ({
          id: assignment.id,
          tenantId: assignment.tenant.id,
          tenantName: assignment.tenant.name,
          billingEmail: assignment.tenant.billingEmail,
          deployStatus: assignment.deployStatus,
          paymentCallbackUrl: assignment.paymentCallbackUrl,
          paymentDeliveryMode: assignment.paymentDeliveryMode,
          serviceApiKeyLastFour: assignment.serviceApiKeyLastFour,
          flags: assignment.flags.map((flag) => ({
            serviceFlagId: flag.serviceFlagId,
            enabled: flag.enabled,
          })),
        })),
      })),
      tenants,
    }
  })

export const getAudit = createServerFn({ method: 'GET' })
  .validator((data: unknown) => auditSchema.parse(data))
  .handler(async ({ data }) => {
    await requireOperator()
    if (data.tenantId && !z.string().uuid().safeParse(data.tenantId).success) {
      return []
    }
    return db.auditLog.findMany({
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
    })
  })

export const getSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireOperator()
    const users = await db.user.findMany({
      where: { deletedAt: null },
      include: {
        tenant: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return {
      members: users.map((user) => ({
        id: user.id,
        role: user.role,
        user: { name: user.name, email: user.email },
        tenant: user.tenant,
      })),
      env: [
        { name: 'DATABASE_URL', required: true },
        { name: 'SHADOW_DATABASE_URL', required: true },
        { name: 'BETTER_AUTH_SECRET', required: true },
        { name: 'BETTER_AUTH_URL', required: true },
        { name: 'ENTITLEMENT_SHARED_SECRET', required: true },
        { name: 'STRIPE_SECRET_KEY', required: true },
        { name: 'STRIPE_WEBHOOK_SECRET', required: true },
        { name: 'SERVER_URL', required: false },
        { name: 'ZIBAL_MERCHANT', required: false },
        { name: 'SMTP_HOST', required: false },
        { name: 'SMTP_PORT', required: false },
        { name: 'SMTP_SECURE', required: false },
        { name: 'SMTP_USER', required: false },
        { name: 'SMTP_PASSWORD', required: false },
        { name: 'SMTP_FROM', required: false },
        { name: 'DUNNING_SCHEDULER_ENABLED', required: false },
      ].map((item) => ({
        ...item,
        configured: Boolean(process.env[item.name]),
      })),
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

export const cancelSubscription = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const actor = await actorId()
    return transitionSubscription(data.subscriptionId, 'CANCELED', {
      actorId: actor,
      reason: data.reason ?? 'Subscription canceled by tenant operator',
    })
  })
