import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import '#/server/dunning'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.$queryRaw`SELECT 1`
          return Response.json({ ok: true, database: 'ok' })
        } catch {
          return Response.json(
            { ok: false, database: 'unavailable' },
            { status: 503 },
          )
        }
      },
    },
  },
})
