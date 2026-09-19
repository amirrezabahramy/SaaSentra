import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { db } from '#/db'

const SERVICE_KEY_PREFIX = 'svc_'

export function generateServiceApiKey(): string {
  return `${SERVICE_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

export async function hashServiceApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, 12)
}

export async function authenticateServiceRequest(
  request: Request,
  input: { serviceId: string; tenantId: string },
): Promise<boolean> {
  const apiKey = request.headers.get('x-service-secret')
  if (!apiKey) return false

  const assignment = await db.tenantService.findUnique({
    where: {
      tenantId_serviceId: {
        tenantId: input.tenantId,
        serviceId: input.serviceId,
      },
    },
    select: {
      serviceApiKeyHash: true,
      serviceApiKeyRevokedAt: true,
      service: { select: { deletedAt: true } },
    },
  })
  if (
    !assignment?.serviceApiKeyHash ||
    assignment.serviceApiKeyRevokedAt ||
    assignment.service.deletedAt ||
    !(await bcrypt.compare(apiKey, assignment.serviceApiKeyHash))
  ) {
    return false
  }
  return true
}
