import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  exchangeLinkedInCode,
  getLinkedInProfile,
  getLinkedInAdminPages,
} from '@/lib/oauth/linkedin'
import { prisma } from '@/lib/prisma'
import { isValidOAuthState, clearOAuthStateCookie } from '@/lib/oauth-state'
import { encryptSecret } from '@/lib/secrets'
import { storeOAuthData } from '@/lib/oauth-temp-store'
import { ensureSessionUser } from '@/lib/session-user'
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

  if (!isValidOAuthState(req, 'linkedin', state)) {
    oauthEvent('linkedin', 'callback', 'state_mismatch')
    return NextResponse.redirect(redirectTo('/accounts?error=linkedin_state_mismatch'))
  }

  if (error || !code) {
    oauthEvent('linkedin', 'callback', 'denied')
    return NextResponse.redirect(
      redirectTo('/accounts?error=linkedin_denied')
    )
  }

  try {
    await ensureSessionUser(session as { user: { id: string; email?: string | null; name?: string | null } })

    // 1. Exchange code for access token
    const { accessToken, refreshToken, expiresIn } = await exchangeLinkedInCode(code)

    // 2. Get user's LinkedIn profile
    const profile = await getLinkedInProfile(accessToken)

    // 3. Fetch ALL pages this user manages (requires org scopes — may not be granted)
    let pages: Awaited<ReturnType<typeof getLinkedInAdminPages>> = []
    let orgAccessDenied = false
    try {
      pages = await getLinkedInAdminPages(accessToken)
    } catch (err: unknown) {
      const error = err as { response?: { data?: unknown }; message?: string }
      const apiError = error.response?.data as { code?: string } | undefined
      if (apiError?.code === 'ACCESS_DENIED') {
        orgAccessDenied = true
      }
      console.warn('LinkedIn admin pages fetch failed (proceeding with personal account only):', error.response?.data || error.message)
    }

    const tokenExpiry = new Date(Date.now() + expiresIn * 1000)

    // 4a. No pages
    if (pages.length === 0) {
      // If org scope is denied, fail clearly for page-only mode.
      if (orgAccessDenied) {
        oauthEvent('linkedin', 'callback', 'pages_permissions_required')
        const res = NextResponse.redirect(
          redirectTo('/accounts?error=linkedin_pages_permissions_required')
        )
        clearOAuthStateCookie(res, 'linkedin')
        return res
      }

      // Otherwise save personal account directly and finish.
      await prisma.socialAccount.upsert({
        where: {
          userId_platform_externalId: {
            userId: session.user.id,
            platform: 'LINKEDIN',
            externalId: profile.id,
          },
        },
        update: {
          accessToken: encryptSecret(accessToken),
          refreshToken: refreshToken ? encryptSecret(refreshToken) : undefined,
          tokenExpiry,
          name: profile.name,
          avatarUrl: profile.picture,
          isActive: true,
        },
        create: {
          userId: session.user.id,
          platform: 'LINKEDIN',
          accountType: 'PERSONAL',
          externalId: profile.id,
          name: profile.name,
          handle: profile.email,
          avatarUrl: profile.picture,
          accessToken: encryptSecret(accessToken),
          refreshToken: refreshToken ? encryptSecret(refreshToken) : null,
          tokenExpiry,
          isActive: true,
        },
      })
      const res = NextResponse.redirect(redirectTo('/accounts?success=linkedin'))
      clearOAuthStateCookie(res, 'linkedin')
      oauthEvent('linkedin', 'callback', 'success')
      return res
    }

    // 4b. Pages found — let user pick which ones to connect
    const key = storeOAuthData({ accessToken, refreshToken, tokenExpiry, profile, pages })

    const res = NextResponse.redirect(
      redirectTo(`/accounts/connect/linkedin?key=${key}`)
    )
    clearOAuthStateCookie(res, 'linkedin')
    oauthEvent('linkedin', 'callback', 'success')
    return res
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    console.error('LinkedIn OAuth error:', error.response?.data || error.message)
    oauthError('linkedin', 'callback', err)
    return NextResponse.redirect(
      redirectTo('/accounts?error=linkedin_failed')
    )
  }
}
