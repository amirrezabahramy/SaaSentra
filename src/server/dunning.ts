import { startDunningJob } from '#/lib/dunning'

const globalForDunning = globalThis as unknown as {
  dunningJobStarted?: boolean
}

if (!globalForDunning.dunningJobStarted) {
  startDunningJob()
  globalForDunning.dunningJobStarted = true
  console.log('[dunning] scheduler started; schedule="0 */4 * * *"')
}
