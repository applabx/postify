import { NextResponse } from 'next/server'
import crypto from 'crypto'

const CSRF_COOKIE = 'csrf_register_v2'
const CSRF_MAX_AGE = 10 * 60 // 10 minutes

export async function GET() {
  const token = crypto.randomUUID()

  const response = NextResponse.json({ csrfToken: token })

  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CSRF_MAX_AGE,
    path: '/',
  })

  return response
}
