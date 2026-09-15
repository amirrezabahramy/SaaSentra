import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'

/**
 * Pathless protected layout: everything nested under it requires a session.
 */
export const Route = createFileRoute('/_protected')({
  beforeLoad: ({ context }) => {
    if (!context.auth) {
      throw redirect({ to: '/login' })
    }
  },
  component: ProtectedLayout,
})

function ProtectedLayout() {
  return <Outlet />
}
