import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const loginRedirect = new URL('/login?verified=1', req.url)
  const errorRedirect = new URL('/login?error=verification_failed', req.url)

  if (!token) return NextResponse.redirect(errorRedirect)

  try {
    const user = await prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
      },
    })

    if (!user) return NextResponse.redirect(errorRedirect)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
      },
    })

    return NextResponse.redirect(loginRedirect)
  } catch (err: unknown) {
    console.error('[VerifyEmail] Error:', (err as { message?: string })?.message)
    return NextResponse.redirect(errorRedirect)
  }
}
