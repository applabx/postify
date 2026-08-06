import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/privacy',
]

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/csrf',
  '/api/oauth/',       // OAuth routes have their own auth + need to work on redirect
  '/api/cron/',        // Cron routes have their own auth via CRON_SECRET
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/api/health',
  '/api/metrics',
]

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return true
  }
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return true
  }
  return false
}

export async function middleware(req: NextRequest) {
  // Attach a correlation id to the request so server-side logs can be
  // traced across middleware, route handlers, and worker jobs.
  // Web Crypto randomUUID works in the Edge runtime (Node's crypto module
  // does not).
  const requestId = req.headers.get('x-request-id') || globalThis.crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  // Explicitly allow public paths — no auth needed
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Check for a valid session token
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (!token) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl, { headers: { 'x-request-id': requestId } })
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

// Apply to all paths except public ones
export const config = {
  matcher: [
    '/((?!login|register|forgot-password|reset-password|privacy|api/auth/|api/csrf|api/oauth/|api/cron/|_next/static|_next/image|favicon.ico|api/health).*)',
  ],
}
