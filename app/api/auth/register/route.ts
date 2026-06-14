import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sendEmail, emailVerificationTemplate } from '@/lib/email'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import crypto from 'crypto'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8
const CSRF_COOKIE = 'csrf_register_v2'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (session) {
      return NextResponse.json({ error: 'Already logged in' }, { status: 400 })
    }

    // ── CSRF double-submit validation ─────────────────────────────────────────
    const csrfCookie = req.cookies.get(CSRF_COOKIE)?.value
    const body = await req.json()
    const { csrfToken, email, password, name } = body

    if (!csrfCookie || !csrfToken || csrfCookie !== csrfToken) {
      return NextResponse.json({ error: 'Invalid request — please refresh and try again.' }, { status: 403 })
    }

    // Validate input
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      )
    }
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
    }

    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)
    const emailVerificationToken = crypto.randomBytes(32).toString('hex')

    // Create user
    await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name.trim(),
        passwordHash,
        emailVerificationToken,
      },
    })

    // Send verification email (non-blocking — don't fail registration if email fails)
    const verificationHtml = emailVerificationTemplate(emailVerificationToken)
    sendEmail({
      to: email,
      subject: 'Verify your Postify account',
      html: verificationHtml,
    }).catch((err: unknown) =>
      console.error(
        '[Register] Failed to send verification email:',
        (err as { message?: string })?.message
      )
    )

    return NextResponse.json({
      success: true,
      message: 'Account created! Check your email to verify your account.',
      needsVerification: true,
    })
  } catch (err: unknown) {
    console.error('[Register] Error:', (err as { message?: string })?.message)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
