import { createServerFn } from '@tanstack/react-start'
import { requireOperator } from './authorization'
import { runDunning } from './dunning'

export const runDunningNow = createServerFn({ method: 'POST' }).handler(
  async () => {
    await requireOperator()
    return { success: true, ...(await runDunning()) }
  },
)
