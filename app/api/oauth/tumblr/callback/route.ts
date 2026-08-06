import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTumblrBlogs } from '@/lib/oauth/platforms'
import axios from 'axios'
import { createHmac, randomBytes } from 'crypto'
import { isValidOAuthState, clearOAuthStateCookie } from '@/lib/oauth-state'
import { storeOAuthData } from '@/lib/oauth-temp-store'
import { redirectTo } from '@/lib/redirect-url'
import { oauthEvent, oauthError } from '@/lib/oauth/telemetry'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(redirectTo('/login'))
  }

  const { searchParams } = new URL(req.url)
  const oauthToken = searchParams.get('oauth_token')
  const oauthVerifier = searchParams.get('oauth_verifier')
  const state = searchParams.get('state')
  const denied = searchParams.get('denied')

  if (!isValidOAuthState(req, 'tumblr', state)) {
    oauthEvent('tumblr', 'callback', 'state_mismatch')
    return NextResponse.redirect(redirectTo('/accounts?error=tumblr_state_mismatch'))
  }

  if (denied || !oauthToken || !oauthVerifier) {
    oauthEvent('tumblr', 'callback', 'denied')
    return NextResponse.redirect(redirectTo('/accounts?error=tumblr_denied'))
  }

  try {
    // Exchange for access token using OAuth 1.0a
    const tokens = await exchangeTumblrToken(oauthToken, oauthVerifier)

    // Fetch all blogs this user owns
    const blogs = await getTumblrBlogs(tokens.accessToken, tokens.accessTokenSecret) as any[]

    // Pass to blog picker
    const key = storeOAuthData({
      accessToken: tokens.accessToken,
      accessTokenSecret: tokens.accessTokenSecret,
      blogs,
    })

    const res = NextResponse.redirect(
      redirectTo(`/accounts/connect/tumblr?key=${key}`)
    )
    clearOAuthStateCookie(res, 'tumblr')
    oauthEvent('tumblr', 'callback', 'success')
    return res
  } catch (err: any) {
    console.error('Tumblr OAuth error:', err.message)
    oauthError('tumblr', 'callback', err)
    return NextResponse.redirect(redirectTo('/accounts?error=tumblr_failed'))
  }
}

async function exchangeTumblrToken(
  oauthToken: string,
  oauthVerifier: string
): Promise<{ accessToken: string; accessTokenSecret: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('hex')

  const params: Record<string, string> = {
    oauth_consumer_key: process.env.TUMBLR_CONSUMER_KEY!,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier,
    oauth_version: '1.0',
  }

  // Build signature
  const baseString = [
    'POST',
    encodeURIComponent('https://www.tumblr.com/oauth/access_token'),
    encodeURIComponent(
      Object.keys(params)
        .sort()
        .map(k => `${k}=${params[k]}`)
        .join('&')
    ),
  ].join('&')

  const signingKey = `${encodeURIComponent(process.env.TUMBLR_CONSUMER_SECRET!)}&`
  const signature = createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')

  params.oauth_signature = signature

  const authHeader =
    'OAuth ' +
    Object.keys(params)
      .sort()
      .map(k => `${k}="${encodeURIComponent(params[k])}"`)
      .join(', ')

  const res = await axios.post('https://www.tumblr.com/oauth/access_token', null, {
    headers: { Authorization: authHeader },
  })

  const result = new URLSearchParams(res.data)
  return {
    accessToken: result.get('oauth_token')!,
    accessTokenSecret: result.get('oauth_token_secret')!,
  }
}
