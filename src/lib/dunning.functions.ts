import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from './auth'
import { runDunning } from './dunning'

export const runDunningNow = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user?.id) throw new Error('Authentication required')
  await runDunning()
  return { success: true }
})
