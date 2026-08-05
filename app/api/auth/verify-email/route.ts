import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { redirectTo } from '@/lib/redirect-url'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const loginRedirect = redirectTo('/login?verified=1')
  const errorRedirect = redirectTo('/login?error=verification_failed')

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
