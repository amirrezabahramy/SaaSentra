import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'
import { db } from '#/db'
import type { Role } from '#/generated/prisma/client'

export function isOperatorRole(role: Role): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export async function requireOperator(): Promise<string> {
  const session = await auth.api.getSession({ headers: getRequest().headers })
  if (!session?.user.id) throw new Error('Authentication required')

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { deletedAt: true, role: true },
  })
  if (user?.deletedAt || !user || !isOperatorRole(user.role)) {
    throw new Error('Not authorized')
  }

  return session.user.id
}
