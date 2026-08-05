import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exchangePinterestCode, getPinterestBoards } from '@/lib/oauth/platforms'
import { prisma } from '@/lib/prisma'
import { isValidOAuthState, clearOAuthStateCookie } from '@/lib/oauth-state'
import { storeOAuthData } from '@/lib/oauth-temp-store'
import { redirectTo } from '@/lib/redirect-url'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(redirectTo('/login'))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (!isValidOAuthState(req, 'pinterest', state)) {
    return NextResponse.redirect(redirectTo('/accounts?error=pinterest_state_mismatch'))
  }

  if (error || !code) {
    return NextResponse.redirect(redirectTo('/accounts?error=pinterest_denied'))
  }

  try {
    const tokens = await exchangePinterestCode(code)
    const boards = await getPinterestBoards(tokens.access_token)

    // Pinterest: one account, many boards — save account + pass boards to picker
    const key = storeOAuthData({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      boards,
    })

    const res = NextResponse.redirect(
      redirectTo(`/accounts/connect/pinterest?key=${key}`)
    )
    clearOAuthStateCookie(res, 'pinterest')
    return res
  } catch (err: any) {
    console.error('Pinterest OAuth error:', err.response?.data || err.message)
    return NextResponse.redirect(redirectTo('/accounts?error=pinterest_failed'))
  }
}
