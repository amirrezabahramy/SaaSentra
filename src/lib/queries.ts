import { queryOptions } from '@tanstack/react-query'
import { getOverview, getTenantDetail, getTenants } from './admin.functions'
import {
  getAudit,
  getFlags,
  getServices,
  getSettings,
  getSubscriptions,
} from './ops.functions'

export const overviewQuery = () =>
  queryOptions({
    queryKey: ['admin', 'overview'],
    queryFn: () => getOverview(),
  })

export const tenantsQuery = (search = '') =>
  queryOptions({
    queryKey: ['admin', 'tenants', { search }],
    queryFn: () => getTenants({ data: { search: search || undefined } }),
  })

export const tenantDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['admin', 'tenant', id],
    queryFn: () => getTenantDetail({ data: { id } }),
  })

export const subscriptionsQuery = (status = '') =>
  queryOptions({
    queryKey: ['admin', 'subscriptions', { status }],
    queryFn: () =>
      getSubscriptions({
        data: { status: status ? (status as 'ACTIVE') : undefined },
      }),
  })

export const servicesQuery = () =>
  queryOptions({
    queryKey: ['admin', 'services'],
    queryFn: () => getServices(),
  })

export const flagsQuery = () =>
  queryOptions({
    queryKey: ['admin', 'flags'],
    queryFn: () => getFlags(),
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
