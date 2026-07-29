import { prisma } from './prisma'

export async function ensureSessionUser(session: { user: { id: string; email?: string | null; name?: string | null } }) {
  await prisma.user.upsert({
    where: { id: session.user.id },
    update: {
      email: session.user.email ?? undefined,
      name: session.user.name ?? undefined,
    },
    create: {
      id: session.user.id,
      email: session.user.email ?? `${session.user.id}@local.invalid`,
      name: session.user.name ?? session.user.id,
    },
  })
}
