import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '#/db'
import { calculateMrr, isRevenueActive } from './metrics'

const searchSchema = z.object({
  search: z.string().max(100).optional(),
  includeArchived: z.boolean().optional().default(false),
})
const tenantIdSchema = z.object({ id: z.string().uuid() })

export const getOverview = createServerFn({ method: 'GET' }).handler(
  async () => {
    const now = new Date()
    const subscriptions = await db.subscription.findMany({
      where: { deletedAt: null },
      include: { plan: true },
    })
    const recentAuditLogs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    })
    const actorIds = recentAuditLogs
      .map((log) => log.actorId)
      .filter((id): id is string => Boolean(id))
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    })
    const actorById = new Map(actors.map((actor) => [actor.id, actor]))

    return {
      mrrCents: calculateMrr(subscriptions, now),
      activeSubscriptions: subscriptions.filter((subscription) =>
        isRevenueActive(
          subscription.status,
          subscription.currentPeriodEnd,
          now,
        ),
      ).length,
      dunningQueue: subscriptions.filter(
        (subscription) =>
          subscription.status === 'PAST_DUE' ||
          subscription.status === 'GRACE_PERIOD',
      ).length,
      recentAudit: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        reason:
          typeof log.metadata === 'object' &&
          log.metadata !== null &&
          'reason' in log.metadata
            ? String(log.metadata.reason)
            : null,
        actor: log.actorId ? (actorById.get(log.actorId) ?? null) : null,
        createdAt: log.createdAt.toISOString(),
      })),
    }
  },
)

export const getTenants = createServerFn({ method: 'GET' })
  .validator((data: unknown) => searchSchema.parse(data))
  .handler(async ({ data }) => {
    const search = data.search?.trim()
    const tenants = await db.tenant.findMany({
      where: {
        ...(data.includeArchived ? {} : { deletedAt: null }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                {
                  memberships: {
                    some: {
                      user: {
                        email: { contains: search, mode: 'insensitive' },
                      },
                      deletedAt: null,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        subscription: { include: { plan: true } },
        memberships: {
          where: { role: 'OWNER', deletedAt: null },
          include: { user: { select: { email: true } } },
          take: 1,
        },
      },
    })

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      ownerEmail: tenant.memberships[0]?.user.email ?? null,
      status: tenant.subscription?.status ?? null,
      archived: Boolean(tenant.deletedAt),
      subscriptionId: tenant.subscription?.id ?? null,
      plan: tenant.subscription?.plan.slug ?? null,
    }))
  })

export const getTenantDetail = createServerFn({ method: 'GET' })
  .validator((data: unknown) => tenantIdSchema.parse(data))
  .handler(async ({ data }) => {
    const tenant = await db.tenant.findUnique({
      where: { id: data.id, deletedAt: null },
      include: {
        subscription: { include: { plan: true } },
        flags: { include: { flag: true }, orderBy: { flag: { key: 'asc' } } },
        services: { orderBy: { name: 'asc' } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 20 },
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    })

    if (!tenant) {
      return null
    }

    const actorIds = tenant.auditLogs
      .map((log) => log.actorId)
      .filter((id): id is string => Boolean(id))
    const actors = await db.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    })
    const actorById = new Map(actors.map((actor) => [actor.id, actor]))

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      subscription: tenant.subscription
        ? {
            id: tenant.subscription.id,
            status: tenant.subscription.status,
            plan: tenant.subscription.plan.slug,
            currentPeriodEnd:
              tenant.subscription.currentPeriodEnd.toISOString(),
            graceEndsAt: tenant.subscription.graceEndsAt?.toISOString() ?? null,
            disabledAt: tenant.subscription.disabledAt?.toISOString() ?? null,
          }
        : null,
      flags: tenant.flags.map((flag) => ({
        key: flag.flag.key,
        enabled: flag.enabled,
      })),
      services: tenant.services.map((service) => ({
        id: service.id,
        name: service.name,
        controlType: service.controlType,
        deployStatus: service.deployStatus,
      })),
      invoices: tenant.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amountCents: invoice.amountCents,
        currency: invoice.currency,
        status: invoice.status,
        createdAt: invoice.createdAt.toISOString(),
      })),
      auditLogs: tenant.auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        reason:
          typeof log.metadata === 'object' &&
          log.metadata !== null &&
          'reason' in log.metadata
            ? String(log.metadata.reason)
            : null,
        actor: log.actorId ? (actorById.get(log.actorId) ?? null) : null,
        createdAt: log.createdAt.toISOString(),
      })),
    }
  })
