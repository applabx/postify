import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLinkedInAuthUrl } from '@/lib/oauth/linkedin'
import { getMetaAuthUrl } from '@/lib/oauth/meta'
import { getTwitterAuthUrl, getPinterestAuthUrl } from '@/lib/oauth/platforms'
import { randomBytes, createHash, createHmac } from 'crypto'
import { setOAuthStateCookie } from '@/lib/oauth-state'
import { redirectTo } from '@/lib/redirect-url'

// GET /api/oauth/[platform]/start
// Redirects the user to the correct OAuth consent screen
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.redirect(redirectTo('/login'))
  }

  const { platform } = await params
  const state = randomBytes(16).toString('hex')

  // Store state in a short-lived cookie to verify on callback
  const response = (url: string, statePlatform: string) => {
    const res = NextResponse.redirect(url)
    setOAuthStateCookie(res, statePlatform, state)
    return res
  }

  switch (platform) {
    case 'linkedin': {
      const url = getLinkedInAuthUrl(state, process.env.NEXT_PUBLIC_APP_URL)
      return response(url, platform)
    }

    case 'meta': {
      const url = getMetaAuthUrl(state, process.env.NEXT_PUBLIC_APP_URL)
      return response(url, platform)
    }

    case 'twitter': {
      // Twitter uses PKCE — generate code verifier + challenge
      const codeVerifier = randomBytes(32).toString('base64url')
      const codeChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url')

      const url = getTwitterAuthUrl(state, codeChallenge)
      const res = NextResponse.redirect(url)
      setOAuthStateCookie(res, platform, state)
      res.cookies.set('twitter_code_verifier', codeVerifier, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/' })
      return res
    }

    case 'pinterest': {
      const url = getPinterestAuthUrl(state)
      return response(url, platform)
    }

    case 'tumblr': {
      // Tumblr OAuth 1.0a — need to get a request token first
      // Then redirect to authorize URL
      const tumblrAuthUrl = await getTumblrRequestToken(state)
      return response(tumblrAuthUrl, platform)
    }

    case 'bluesky': {
      // Bluesky uses app passwords, not OAuth — redirect to form page
      return NextResponse.redirect(redirectTo('/accounts/connect/bluesky'))
    }

    default:
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
  }
}

// Tumblr OAuth 1.0a - get request token then build authorize URL
async function getTumblrRequestToken(state: string): Promise<string> {
  const axios = (await import('axios')).default

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = randomBytes(16).toString('hex')
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/tumblr/callback?state=${state}`

  const params: Record<string, string> = {
    oauth_callback: callbackUrl,
    oauth_consumer_key: process.env.TUMBLR_CONSUMER_KEY!,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
  }

  const baseString = [
    'POST',
    encodeURIComponent('https://www.tumblr.com/oauth/request_token'),
    encodeURIComponent(
      Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')
    ),
  ].join('&')

  const signingKey = `${encodeURIComponent(process.env.TUMBLR_CONSUMER_SECRET!)}&`
  const signature = createHmac('sha1', signingKey).update(baseString).digest('base64')
  params.oauth_signature = signature

  const authHeader =
    'OAuth ' +
    Object.keys(params).sort().map(k => `${k}="${encodeURIComponent(params[k])}"`).join(', ')

  const res = await axios.post(
    'https://www.tumblr.com/oauth/request_token',
    null,
    { headers: { Authorization: authHeader } }
  ).catch(() => null)

  if (!res?.data) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/accounts?error=tumblr_init_failed`
  }

  const resultParams = new URLSearchParams(res.data)
  const oauthToken = resultParams.get('oauth_token')
  return `https://www.tumblr.com/oauth/authorize?oauth_token=${oauthToken}`
}
