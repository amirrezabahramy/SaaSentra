import { startDunningJob } from '#/lib/dunning'
import { env } from '#/env'

const globalForDunning = globalThis as unknown as {
  dunningJobStarted?: boolean
}

if (!globalForDunning.dunningJobStarted) {
  if (env.DUNNING_SCHEDULER_ENABLED !== 'false') {
    startDunningJob()
  }
  globalForDunning.dunningJobStarted = true
  console.log(
    env.DUNNING_SCHEDULER_ENABLED === 'false'
      ? '[dunning] scheduler disabled by configuration'
      : '[dunning] scheduler started; schedule="0 */4 * * *"',
  )
}
