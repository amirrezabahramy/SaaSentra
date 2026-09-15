import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import db from '#/db'
import { env } from '#/env'

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ password, hash }) => bcrypt.compare(password, hash),
    },
  },
  plugins: [tanstackStartCookies()],
})
