import { createFileRoute } from '@tanstack/react-router'
import '#/server/dunning'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
})
