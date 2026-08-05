/**
 * lib/email.ts — Resend transactional email helper.
 * Falls back to console.log in development when SMTP is not configured.
 */

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT || '587'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM || 'Postify <noreply@postify.app>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[Email] SMTP not configured — would send to ${to}: ${subject}`)
    console.log(`[Email] Body preview: ${html.slice(0, 200)}...`)
    return
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })

  await transporter.sendMail({ from: SMTP_FROM, to, subject, html })
}

// ─── Email templates ────────────────────────────────────────────────────────────

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f8; margin: 0; padding: 24px; }
  .container { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; }
  .logo { font-size: 20px; font-weight: 700; color: #7c6eff; margin-bottom: 24px; }
  .btn { display: inline-block; background: #7c6eff; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin: 16px 0; }
  .footer { margin-top: 24px; font-size: 12px; color: #9999aa; }
</style></head>
<body>
<div class="container">
  <div class="logo">Postify</div>
  ${content}
  <div class="footer">Postify — Social media publishing, simplified.</div>
</div>
</body>
</html>`
}

export function emailVerificationTemplate(token: string): string {
  const url = `${APP_URL}/api/auth/verify-email?token=${token}`
  return baseTemplate(`
    <h2>Verify your email</h2>
    <p>Welcome to Postify! Click the button below to verify your email address.</p>
    <a href="${url}" class="btn">Verify Email</a>
    <p>Or copy this link: <a href="${url}">${url}</a></p>
    <p style="font-size:13px;color:#888">This link expires in 24 hours.</p>
  `)
}

export function passwordResetTemplate(token: string): string {
  const url = `${APP_URL}/reset-password?token=${token}`
  return baseTemplate(`
    <h2>Reset your password</h2>
    <p>You requested a password reset for your Postify account.</p>
    <a href="${url}" class="btn">Reset Password</a>
    <p>Or copy this link: <a href="${url}">${url}</a></p>
    <p style="font-size:13px;color:#888">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `)
}
