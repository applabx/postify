import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { authenticateBluesky } from '@/lib/oauth/platforms'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/secrets'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { handle, appPassword } = await req.json()

  if (!handle || !appPassword) {
    return NextResponse.json({ error: 'Handle and app password are required' }, { status: 400 })
  }

  try {
    // Authenticate with Bluesky — if this succeeds, credentials are valid
    const profile = await authenticateBluesky(handle, appPassword)

    // Save encrypted credentials at rest.
    // accessToken stores the AT Protocol access JWT (used directly as accessJwt at publish time).
    // refreshToken stores the AT Protocol refresh JWT for session renewal.
    // Bluesky access JWTs last ~2 hours; set expiry so the refresh cron picks it up
    const tokenExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000)

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: session.user.id,
          platform: 'BLUESKY',
          externalId: profile.did,
        },
      },
      update: {
        name: profile.displayName || handle,
        handle: profile.handle,
        accessToken: encryptSecret(profile.accessJwt),
        refreshToken: encryptSecret(profile.refreshJwt),
        tokenExpiry,
        isActive: true,
      },
      create: {
        userId: session.user.id,
        platform: 'BLUESKY',
        accountType: 'PERSONAL',
        externalId: profile.did,
        name: profile.displayName || handle,
        handle: profile.handle,
        accessToken: encryptSecret(profile.accessJwt),
        refreshToken: encryptSecret(profile.refreshJwt),
        tokenExpiry,
      },
    })

    return NextResponse.json({ success: true, handle: profile.handle })
  } catch (err: any) {
    const msg = err.response?.data?.message || err.message || 'Authentication failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
