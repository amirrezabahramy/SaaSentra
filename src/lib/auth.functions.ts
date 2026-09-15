import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  setResponseHeader,
  setResponseStatus,
} from '@tanstack/react-start/server'
import { z } from 'zod'
import { auth } from './auth'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

function copyResponseHeaders(response: Response): void {
  response.headers.forEach((value, key) => setResponseHeader(key, value))
}

export const getAuthSession = createServerFn({ method: 'GET' }).handler(
  async () =>
    auth.api.getSession({
      headers: getRequest().headers,
    }),
)

export const signIn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => credentialsSchema.parse(data))
  .handler(async ({ data }) => {
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
