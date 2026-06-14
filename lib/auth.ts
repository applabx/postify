import type { NextAuthOptions, Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check if running locally (dev server or local docker) */
function isLocalRuntime(): boolean {
  const url = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
  } catch {
    return false
  }
}

/**
 * devAuthEnabled — evaluated at call time (not module-load time).
 * Reads process.env freshly on every invocation so Docker runtime values
 * are always used, even if the webpack bundle was built without them.
 */
function getDevAuthEnabled(): boolean {
  return (
    process.env.ENABLE_DEV_AUTH === 'true' ||
    (!process.env.NODE_ENV || process.env.NODE_ENV !== 'production')
  )
}

/**
 * usePrismaAdapter — evaluated at call time.
 * Only use the DB adapter when NOT local and explicitly opted in.
 */
function getUsePrismaAdapter(): boolean {
  return (
    !isLocalRuntime() &&
    (process.env.NODE_ENV === 'production' ||
      process.env.AUTH_USE_PRISMA_ADAPTER === 'true')
  )
}

// ─── In-memory rate limiter ────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 20

export function checkRateLimit(key: string): { allowed: boolean } {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= MAX_ATTEMPTS_PER_WINDOW) {
    return { allowed: false }
  }

  entry.count++
  return { allowed: true }
}

export function clearRateLimit(key: string): void {
  rateLimitMap.delete(key)
}

// ─── Auth options ─────────────────────────────────────────────────────────────

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login',
    verifyRequest: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        // ── Rate limit by IP + email ──────────────────────────────────────────
        const creds = credentials as { email: string; password: string }
        const ip =
          (credentials as unknown as { request?: { headers?: Record<string, string> } })
            .request?.headers?.['x-forwarded-for'] ||
          (credentials as unknown as { request?: { headers?: Record<string, string> } })
            .request?.headers?.['x-real-ip'] ||
          'unknown'
        const rlKey = `${ip}:${creds.email}`
        const { allowed } = checkRateLimit(rlKey)
        if (!allowed) {
          console.warn(`[Auth] Rate limit exceeded for ${rlKey}`)
          throw new Error('Too many login attempts. Please try again in 15 minutes.')
        }

        // ── Dev-mode bypass ──────────────────────────────────────────────────
        const devAuthEnabled = getDevAuthEnabled()
        const usePrismaAdapter = getUsePrismaAdapter()

        if (devAuthEnabled && creds.password === 'dev') {
          clearRateLimit(rlKey)
          // Dev mode: create/return user via DB (fast path for development)
          if (!usePrismaAdapter) {
            return {
              id: `dev_${Buffer.from(creds.email).toString('base64url').slice(0, 24)}`,
              email: creds.email,
              name: creds.email.split('@')[0],
            }
          }
          // usePrismaAdapter path — upsert user
          try {
            const user = await prisma.user.upsert({
              where: { email: creds.email },
              update: {},
              create: { email: creds.email, name: creds.email.split('@')[0] },
            })
            return { id: user.id, email: user.email, name: user.name }
          } catch (err: unknown) {
            console.warn(
              '[Auth] Dev upsert failed, using fallback:',
              (err as { message?: string })?.message
            )
            return {
              id: `dev_${Buffer.from(creds.email).toString('base64url').slice(0, 24)}`,
              email: creds.email,
              name: creds.email.split('@')[0],
            }
          }
        }

        // ── Real credentials auth (production) ────────────────────────────────
        try {
          const user = await prisma.user.findUnique({
            where: { email: creds.email },
          })

          if (!user || !user.passwordHash) {
            clearRateLimit(rlKey)
            return null
          }

          const passwordMatch = await bcrypt.compare(creds.password, user.passwordHash)
          if (!passwordMatch) {
            // Increment failed login count
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: { increment: 1 },
                lockedUntil:
                  user.failedLoginAttempts >= 4
                    ? new Date(Date.now() + 15 * 60 * 1000)
                    : undefined,
              },
            })
            console.warn(
              `[Auth] Failed login for ${creds.email}, attempt ${user.failedLoginAttempts + 1}`
            )
            return null
          }

          // Success — reset failed attempts, clear rate limit
          clearRateLimit(rlKey)
          if (user.failedLoginAttempts > 0 || user.lockedUntil) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: null },
            })
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          }
        } catch (err: unknown) {
          console.error(
            '[Auth] Database error during authorize:',
            (err as { message?: string })?.message
          )
          return null
        }
      },
    }),
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: getUsePrismaAdapter() ? (PrismaAdapter(prisma) as any) : undefined,
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) token.id = user.id
      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token && session.user) session.user.id = token.id as string
      return session
    },
  },
}
