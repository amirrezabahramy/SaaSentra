import { getProductionReadiness } from '#/lib/production-readiness'
import { db } from '#/db'

try {
  const report = await getProductionReadiness()
  console.log(JSON.stringify(report, null, 2))
  if (!report.ready) process.exitCode = 1
} finally {
  await db.$disconnect()
}
