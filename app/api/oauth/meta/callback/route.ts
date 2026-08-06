import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import {
  exchangeMetaCode,
  getLongLivedToken,
  getFacebookPages,
  getFacebookGroups,
} from '@/lib/oauth/meta'
import { authOptions } from '@/lib/auth'
import { isValidOAuthState, clearOAuthStateCookie } from '@/lib/oauth-state'
import { prisma } from '@/lib/prisma'
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

  if (!isValidOAuthState(req, 'meta', state)) {
    oauthEvent('meta', 'callback', 'state_mismatch')
    return NextResponse.redirect(redirectTo('/accounts?error=meta_state_mismatch'))
  }

  if (error || !code) {
    oauthEvent('meta', 'callback', 'denied')
    return NextResponse.redirect(redirectTo('/accounts?error=meta_denied'))
  }

  try {
    await ensureSessionUser(session as { user: { id: string; email?: string | null; name?: string | null } })

    // 1. Short-lived token
    const { accessToken: shortToken } = await exchangeMetaCode(code)

    // 2. Upgrade to long-lived token (60 days)
    const longToken = await getLongLivedToken(shortToken)

    // 3. Fetch all pages and groups in parallel
    const [pages, groups] = await Promise.all([
      getFacebookPages(longToken),
      getFacebookGroups(longToken),
    ])

    // 4. Pass to picker UI
    const key = storeOAuthData({ accessToken: longToken, pages, groups })

    const res = NextResponse.redirect(
      redirectTo(`/accounts/connect/meta?key=${key}`)
    )
    clearOAuthStateCookie(res, 'meta')
    oauthEvent('meta', 'callback', 'success')
    return res
  } catch (err: unknown) {
    const error = err as { response?: { data?: unknown }; message?: string }
    console.error('Meta OAuth error:', error.response?.data || error.message)
    oauthError('meta', 'callback', err)
    return NextResponse.redirect(redirectTo('/accounts?error=meta_failed'))
  }
}
