import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/secrets'
import { consumeOAuthData } from '@/lib/oauth-temp-store'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { key: string; board: { id: string; name: string } }
  const { key, board } = body

  const pending = consumeOAuthData<{
    accessToken: string
    refreshToken: string
    expiresIn: number
    boards: Array<{ id: string; name: string }>
  }>(key)
  if (!pending) {
    return NextResponse.json({ error: 'Session expired. Please reconnect Pinterest.' }, { status: 400 })
  }

  const { accessToken, refreshToken, expiresIn } = pending
  const tokenExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

  await prisma.socialAccount.upsert({
    where: {
      userId_platform_externalId: {
        userId: session.user.id,
        platform: 'PINTEREST',
        externalId: board.id,
      },
    },
    update: {
      name: board.name,
      accessToken: encryptSecret(accessToken),
      refreshToken: refreshToken ? encryptSecret(refreshToken) : null,
      tokenExpiry: tokenExpiry ? new Date(tokenExpiry) : null,
      pageId: board.id,
      isActive: true,
    },
    create: {
      userId: session.user.id,
      platform: 'PINTEREST',
      accountType: 'BOARD',
      externalId: board.id,
      name: board.name,
      accessToken: encryptSecret(accessToken),
      refreshToken: refreshToken ? encryptSecret(refreshToken) : null,
      tokenExpiry: tokenExpiry ? new Date(tokenExpiry) : null,
      pageId: board.id,
    },
  })

  return NextResponse.json({ success: true })
}
