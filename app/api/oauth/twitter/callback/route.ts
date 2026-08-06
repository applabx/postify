import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exchangeTwitterCode, getTwitterProfile } from '@/lib/oauth/platforms'
import { prisma } from '@/lib/prisma'
import { isValidOAuthState, clearOAuthStateCookie } from '@/lib/oauth-state'
import { encryptSecret } from '@/lib/secrets'
import { redirectTo } from '@/lib/redirect-url'
import { oauthEvent, oauthError } from '@/lib/oauth/telemetry'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(redirectTo('/login'))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Verify state to prevent CSRF
  if (!isValidOAuthState(req, 'twitter', state)) {
    oauthEvent('twitter', 'callback', 'state_mismatch')
    return NextResponse.redirect(redirectTo('/accounts?error=twitter_state_mismatch'))
  }

  if (error || !code) {
    oauthEvent('twitter', 'callback', 'denied')
    return NextResponse.redirect(redirectTo('/accounts?error=twitter_denied'))
  }

  const codeVerifier = req.cookies.get('twitter_code_verifier')?.value
  if (!codeVerifier) {
    return NextResponse.redirect(redirectTo('/accounts?error=twitter_no_verifier'))
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
    const res = NextResponse.redirect(redirectTo('/accounts?success=twitter'))
    clearOAuthStateCookie(res, 'twitter')
    oauthEvent('twitter', 'callback', 'success')
    res.cookies.delete('twitter_code_verifier')
    return res
  } catch (err: any) {
    console.error('Twitter OAuth error:', err.response?.data || err.message)
    oauthError('twitter', 'callback', err)
    return NextResponse.redirect(redirectTo('/accounts?error=twitter_failed'))
  }
}
