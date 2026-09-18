import bcrypt from 'bcryptjs'
import { PrismaClient } from '#/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '#/env'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
const db = new PrismaClient({ adapter })

const ownerEmail = process.env.OWNER_EMAIL ?? 'owner@example.com'
const ownerPassword = process.env.OWNER_PASSWORD ?? 'Owner123!'

async function main() {
  const password = await bcrypt.hash(ownerPassword, 12)
  const owner = await db.user.upsert({
    where: { email: ownerEmail },
    update: {
      name: 'Owner',
      emailVerified: true,
      role: 'OWNER',
      tenantId: null,
    },
    create: {
      email: ownerEmail,
      name: 'Owner',
      emailVerified: true,
      role: 'OWNER',
    },
  })

  const account = await db.account.findFirst({
    where: { userId: owner.id, providerId: 'credential' },
    select: { id: true },
  })
  if (account) {
    await db.account.update({
      where: { id: account.id },
      data: { accountId: owner.id, password },
    })
  } else {
    await db.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: owner.id,
        providerId: 'credential',
        userId: owner.id,
        password,
      },
    })
  }

  console.log(`Owner account seeded: ${ownerEmail}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
