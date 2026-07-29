import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/secrets'
import { consumeOAuthData } from '@/lib/oauth-temp-store'
import { ensureSessionUser } from '@/lib/session-user'

type LinkedInPage = {
  id: string
  urn?: string
  name: string
  vanityName?: string
  logoUrl?: string
}

// POST /api/oauth/linkedin/save
// Called after user picks which LinkedIn pages to connect
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureSessionUser(session as { user: { id: string; email?: string | null; name?: string | null } })

  const body = await req.json() as {
    key: string
    selectedPageIds: string[]
  }
  const { key, selectedPageIds } = body

  type PendingData = {
    accessToken: string
    refreshToken?: string
    tokenExpiry: string
    pages: LinkedInPage[]
  }
  const pending = consumeOAuthData<PendingData>(key)
  if (!pending) {
    return NextResponse.json({ error: 'Session expired. Please reconnect LinkedIn.' }, { status: 400 })
  }

  const { accessToken, refreshToken, tokenExpiry, pages } = pending

  if (!selectedPageIds?.length) {
    return NextResponse.json({ error: 'No pages selected' }, { status: 400 })
  }

  const selectedPages = pages.filter((p) => selectedPageIds.includes(p.id))

  // Upsert each selected page as a SocialAccount
  const saved = await Promise.all(
    selectedPages.map((page) =>
      prisma.socialAccount.upsert({
        where: {
          userId_platform_externalId: {
            userId: session.user.id,
            platform: 'LINKEDIN',
            externalId: page.id,
          },
        },
        update: {
          name: page.name,
          handle: page.vanityName,
          avatarUrl: page.logoUrl,
          accessToken: encryptSecret(accessToken),
          refreshToken: refreshToken ? encryptSecret(refreshToken) : undefined,
          tokenExpiry: new Date(tokenExpiry),
          isActive: true,
        },
        create: {
          userId: session.user.id,
          platform: 'LINKEDIN',
          accountType: 'PAGE',
          externalId: page.id,
          name: page.name,
          handle: page.vanityName,
          avatarUrl: page.logoUrl,
          accessToken: encryptSecret(accessToken),
          refreshToken: refreshToken ? encryptSecret(refreshToken) : null,
          tokenExpiry: new Date(tokenExpiry),
          pageId: page.urn,
        },
      })
    )
  )

  return NextResponse.json({ saved: saved.length })
}
