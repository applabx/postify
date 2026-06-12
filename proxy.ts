import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    // All matched routes are now protected — next-auth handles the redirect
    return NextResponse.next()
  },
  {
    callbacks: {
      // Return true = allow, false = redirect to login
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
)

// Protect everything except login, public assets, and API auth routes
export const config = {
  matcher: [
    '/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
}
