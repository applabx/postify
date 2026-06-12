import { NextRequest, NextResponse } from 'next/server'

export function getOAuthStateCookieName(platform: string): string {
  return `oauth_state_${platform}`
}

export function setOAuthStateCookie(res: NextResponse, platform: string, state: string) {
  res.cookies.set(getOAuthStateCookieName(platform), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
}

export function isValidOAuthState(req: NextRequest, platform: string, incomingState: string | null): boolean {
  const storedState = req.cookies.get(getOAuthStateCookieName(platform))?.value
  return !!storedState && !!incomingState && storedState === incomingState
}

export function clearOAuthStateCookie(res: NextResponse, platform: string) {
  res.cookies.delete(getOAuthStateCookieName(platform))
}
