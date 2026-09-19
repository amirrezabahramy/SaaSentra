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
  serviceId: string,
): Promise<boolean> {
  const apiKey = request.headers.get('x-service-secret')
  if (!apiKey) return false

  const service = await db.service.findUnique({
    where: { id: serviceId, deletedAt: null },
    select: {
      serviceApiKeyHash: true,
      serviceApiKeyRevokedAt: true,
    },
  })
  if (
    !service?.serviceApiKeyHash ||
    service.serviceApiKeyRevokedAt ||
    !(await bcrypt.compare(apiKey, service.serviceApiKeyHash))
  ) {
    return false
  }
  return true
}
