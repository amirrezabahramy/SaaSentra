import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

/**
 * Server function that resolves the current session.
 * TODO: read the session cookie / JWT here (e.g. via getCookie from vinxi/http
 * or getWebRequest) and validate it against your auth provider.
 */
async function getSession(): Promise<{ userId: string } | null> {
  // Stub: replace with real session lookup.
  return null
}

/**
 * Protected layout route: everything nested under it requires a session.
 */
export const Route = createFileRoute('/protected')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session) {
      throw redirect({ to: '/' })
    }
    return { session }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  return <Outlet />
}
