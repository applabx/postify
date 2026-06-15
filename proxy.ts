import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
)

// Protect everything except:
// - Public auth pages (register, forgot-password, reset-password)
// - NextAuth API routes and CSRF endpoints
// - Static assets and health checks
export const config = {
  matcher: [
    '/((?!login|register|forgot-password|reset-password|api/auth/callback|api/auth/csrf|api/csrf|_next/static|_next/image|favicon.ico|api/health).*)',
  ],
}
