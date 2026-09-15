import { createFileRoute } from '@tanstack/react-router'
import { createFileRoute, redirect, Outlet } from "@tanstack/start";

/**
 * Server function that resolves the current session.
 * TODO: read the session cookie / JWT here (e.g. via getCookie from vinxi/http
 * or getWebRequest) and validate it against your auth provider.
 */
async function getSession(): Promise<{ userId: string } | null> {
  // Stub: replace with real session lookup.
  return null;
}

/**
 * Pathless layout route: everything nested under it requires a session.
 */
export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return <Outlet />;
}
