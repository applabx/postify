import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exchangeTwitterCode, getTwitterProfile } from '@/lib/oauth/platforms'
import { prisma } from '@/lib/prisma'
import { isValidOAuthState, clearOAuthStateCookie } from '@/lib/oauth-state'
import { encryptSecret } from '@/lib/secrets'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Verify state to prevent CSRF
  if (!isValidOAuthState(req, 'twitter', state)) {
    return NextResponse.redirect(new URL('/accounts?error=twitter_state_mismatch', req.url))
  }

  if (error || !code) {
    return NextResponse.redirect(new URL('/accounts?error=twitter_denied', req.url))
  }

  const codeVerifier = req.cookies.get('twitter_code_verifier')?.value
  if (!codeVerifier) {
    return NextResponse.redirect(new URL('/accounts?error=twitter_no_verifier', req.url))
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeTwitterCode(code, codeVerifier)
    const profile = await getTwitterProfile(tokens.access_token)

    // Calculate token expiry
    const tokenExpiry = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null

    await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: session.user.id,
          platform: 'TWITTER',
          externalId: profile.id,
        },
      },
      update: {
        name: profile.name,
        handle: profile.username,
        avatarUrl: profile.profile_image_url,
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        tokenExpiry,
        isActive: true,
      },
      create: {
        userId: session.user.id,
        platform: 'TWITTER',
        accountType: 'PERSONAL',
        externalId: profile.id,
        name: profile.name,
        handle: profile.username,
        avatarUrl: profile.profile_image_url,
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
        tokenExpiry,
      },
    })

    // Clear PKCE cookies
    const res = NextResponse.redirect(new URL('/accounts?success=twitter', req.url))
    clearOAuthStateCookie(res, 'twitter')
    res.cookies.delete('twitter_code_verifier')
    return res
  } catch (err: any) {
    console.error('Twitter OAuth error:', err.response?.data || err.message)
    return NextResponse.redirect(new URL('/accounts?error=twitter_failed', req.url))
  }
}
