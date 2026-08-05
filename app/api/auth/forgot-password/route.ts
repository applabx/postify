import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, passwordResetTemplate } from '@/lib/email'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'
import { reviewerResetBlocked } from '@/lib/authz'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (session) {
      return NextResponse.json({ error: 'Already logged in' }, { status: 400 })
    }

    const body = await req.json()
    const { email } = body

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Always return success to prevent email enumeration
    // (Even if user doesn't exist, show success to not leak account existence)
    const genericMessage =
      'If an account with that email exists, we sent a password reset link.'

    if (!user) {
      console.log(`[ForgotPassword] No user found for: ${normalizedEmail}`)
      return NextResponse.json({ success: true, message: genericMessage })
    }

    // Reviewer accounts never use the password-reset flow: their password is
    // managed exclusively by `npm run seed:reviewer`. Return the generic
    // message so the account's existence is not revealed, and do NOT issue a
    // reset token.
    if (reviewerResetBlocked(user)) {
      console.warn(`[ForgotPassword] Reset blocked for reviewer account: ${normalizedEmail}`)
      return NextResponse.json({ success: true, message: genericMessage })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS)

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    })

    // Send email (non-blocking)
    const resetHtml = passwordResetTemplate(resetToken)
    sendEmail({
      to: normalizedEmail,
      subject: 'Reset your Postify password',
      html: resetHtml,
    }).catch((err: unknown) =>
      console.error(
        '[ForgotPassword] Failed to send email:',
        (err as { message?: string })?.message
      )
    )

    return NextResponse.json({ success: true, message: genericMessage })
  } catch (err: unknown) {
    console.error('[ForgotPassword] Error:', (err as { message?: string })?.message)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
