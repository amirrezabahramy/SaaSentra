import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import db from '#/db'
import { auth } from './auth'
import { consumeRateLimit } from './rate-limit'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

function copyResponseHeaders(response: Response): void {
  response.headers.forEach((value, key) => setResponseHeader(key, value))
}

export const getAuthSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await auth.api.getSession({
      headers: getRequest().headers,
    })
    if (!session) return null
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, tenantId: true },
    })
    if (!user) return null
    return {
      ...session,
      user: { ...session.user, role: user.role, tenantId: user.tenantId },
    }
  },
)

export const signIn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => credentialsSchema.parse(data))
  .handler(async ({ data }) => {
    if (
      !consumeRateLimit(`sign-in:${data.email.trim().toLowerCase()}`, {
        limit: 10,
        windowMs: 15 * 60_000,
      })
    ) {
      throw new Error('Invalid email or password')
    }
    const response = await auth.api.signInEmail({
      body: data,
      headers: getRequest().headers,
      asResponse: true,
    })
    copyResponseHeaders(response)
    setResponseStatus(response.status)
    if (!response.ok) {
      throw new Error('Invalid email or password')
    }
    return response.json()
  })

export const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const response = await auth.api.signOut({
    headers: getRequest().headers,
    asResponse: true,
  })
  copyResponseHeaders(response)
  setResponseStatus(response.status)
  return { success: response.ok }
})
