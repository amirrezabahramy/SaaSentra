# Basic Utils & Architectural Standards

> [!IMPORTANT]
> **Version Disclaimer:** The code patterns and syntax provided in this document are based on the current stable versions of the mentioned libraries. Code may differ or require updates if package versions are upgraded or downgraded. Always refer to official documentation for the specific version used in the project.

This document outlines the core technology stack and standard implementation patterns for the SaaSentra dashboard.

## Core Stack

- **Framework:** TanStack Start (Full-stack)
- **Database:** Prisma (Postgres/SQLite)
- **UI Components:** shadcn/ui
- **Data Fetching/State:** TanStack Query
- **Forms:** TanStack Form
- **Validation:** Zod

---

## 1. Data Fetching & State (TanStack Query)

We avoid `useLoaderData` in favor of a query-first approach using `ensureQueryData` (newly named `query`) and `useSuspenseQuery`.

### Pattern:

1.  **Define Query Options:** Keep query keys and fetcher functions in a dedicated `queries.ts` file.
2.  **Server-Side:** Use `query(queryOptions)` in the loader to ensure data is pre-fetched on the server.
3.  **Client-Side:** Use `useSuspenseQuery(queryOptions)` to consume the data.

```typescript
// features/users/queries.ts
export const userQueryOptions = (id: string) => queryOptions({
  queryKey: ['users', id],
  queryFn: () => getUserById(id),
})

// routes/users/$id.tsx
export const Route = createFileRoute('/users/$id')({
  loader: ({ params }) => query(userQueryOptions(params.id)),
  component: UserComponent,
})

function UserComponent() {
  const { data } = useSuspenseQuery(userQueryOptions(Route.useParams().id))
  return <div>{data.name}</div>
}
```
