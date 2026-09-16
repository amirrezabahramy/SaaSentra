import { queryOptions } from '@tanstack/react-query'
import { getOverview, getTenantDetail, getTenants } from './admin.functions'
import {
  getAudit,
  getFlags,
  getPlans,
  getServices,
  getSettings,
  getSubscriptions,
} from './ops.functions'

export const overviewQuery = () =>
  queryOptions({
    queryKey: ['admin', 'overview'],
    queryFn: () => getOverview(),
  })

export const tenantsQuery = (search = '', includeArchived = false) =>
  queryOptions({
    queryKey: ['admin', 'tenants', { search, includeArchived }],
    queryFn: () =>
      getTenants({
        data: { search: search || undefined, includeArchived },
      }),
  })

export const tenantDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin', 'tenant', id],
    queryFn: () => getTenantDetail({ data: { id } }),
  })

export const subscriptionsQuery = (status = '', includeArchived = false) =>
  queryOptions({
    queryKey: ['admin', 'subscriptions', { status, includeArchived }],
    queryFn: () =>
      getSubscriptions({
        data: {
          status: status ? (status as 'ACTIVE') : undefined,
          includeArchived,
        },
      }),
  })

export const servicesQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ['admin', 'services', { includeArchived }],
    queryFn: () => getServices({ data: { includeArchived } }),
  })

export const flagsQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ['admin', 'flags', { includeArchived }],
    queryFn: () => getFlags({ data: { includeArchived } }),
  })

export const plansQuery = (includeArchived = false) =>
  queryOptions({
    queryKey: ['admin', 'plans', { includeArchived }],
    queryFn: () => getPlans({ data: { includeArchived } }),
  })

export const auditQuery = (tenantId = '', action = '') =>
  queryOptions({
    queryKey: ['admin', 'audit', { tenantId, action }],
    queryFn: () =>
      getAudit({
        data: {
          tenantId: tenantId || undefined,
          action: action || undefined,
        },
      }),
  })

export const settingsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'settings'],
    queryFn: () => getSettings(),
  })
