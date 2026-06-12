import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/secrets'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { accessToken, refreshToken, tokenExpiry, board } = await req.json()

  // Pinterest: one account entry, with the selected board stored as pageId
  // The account externalId = board.id so user can connect different boards separately
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
