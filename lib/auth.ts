import type { NextAuthOptions, Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from './prisma'
import bcrypt from 'bcryptjs'
import Redis from 'ioredis'

// ─── Redis client (lazy singleton — shared across all workers) ────────────────

let _redis: Redis | null = null

function getRedis(): Redis | null {
  if (_redis) return _redis
  try {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    _redis.on('error', () => {
      // Silently swallow — fallback to in-memory will protect the request
    })
  } catch {
    return null
  }
  return _redis
}

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

// ─── Redis-backed rate limiter (with in-memory fallback) ──────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 20

// Synchronous in-memory check (fallback only — not shared across workers)
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

// Async — uses Redis when available (global across all workers), falls back to in-memory
export async function checkRateLimitAsync(key: string): Promise<{ allowed: boolean }> {
  const redis = getRedis()

  if (redis) {
    try {
      const rlKey = `ratelimit:${key}`
      const pipeline = redis.pipeline()
      pipeline.incr(rlKey)
      pipeline.pttl(rlKey)
      const results = await pipeline.exec()

      if (results && results.length >= 2) {
        const count = results[0][1]
        const ttl = results[1][1]

        // On cold start the Redis connection may not be established yet
        // (lazyConnect + enableOfflineQueue:false causes pipeline commands
        // to be rejected with undefined results). A non-numeric result
        // means the counter was not incremented, NOT that the user hit the
        // limit — fall through to the in-memory limiter instead of
        // evaluating `undefined <= MAX_ATTEMPTS` (which is always false).
        if (typeof count !== 'number' || typeof ttl !== 'number') {
          return checkRateLimit(key)
        }

        // Set expiry on first request in this window
        if (ttl === -1) {
          await redis.pexpire(rlKey, RATE_LIMIT_WINDOW_MS)
        }

        return { allowed: count <= MAX_ATTEMPTS_PER_WINDOW }
      }
    } catch {
      // Redis unavailable — fall through to in-memory
    }
  }

  // In-memory fallback
  return checkRateLimit(key)
}

export async function clearRateLimit(key: string): Promise<void> {
  const redis = getRedis()
  if (redis) {
    try {
      await redis.del(`ratelimit:${key}`)
      return
    } catch {
      // Redis unavailable — fall through
    }
  }
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
        const { allowed } = await checkRateLimitAsync(rlKey)
        if (!allowed) {
          console.warn(`[Auth] Rate limit exceeded for ${rlKey}`)
          throw new Error('Too many login attempts. Please try again in 15 minutes.')
        }

        // ── Dev-mode bypass ──────────────────────────────────────────────────
        const devAuthEnabled = getDevAuthEnabled()
        const usePrismaAdapter = getUsePrismaAdapter()

        if (devAuthEnabled && creds.password === 'dev') {
          await clearRateLimit(rlKey)
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
            await clearRateLimit(rlKey)
            return null
          }

          // Block login while account is locked
          if (user.lockedUntil && user.lockedUntil > new Date()) {
            const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
            console.warn(`[Auth] Login blocked — account locked for ${creds.email}, ${remaining}min remaining`)
            throw new Error('CredentialsSignin')
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

          // Block unverified users — they must click the email link first
          if (!user.emailVerified) {
            await clearRateLimit(rlKey)
            console.warn(`[Auth] Login blocked — email not verified: ${creds.email}`)
            // Use CredentialsSignin so NextAuth preserves the error redirect
            // (NextAuth only passes through CredentialsSignin; all other thrown
            // errors get swallowed into a generic error=credentials redirect)
            throw new Error('CredentialsSignin')
          }

          // Success — reset failed attempts, clear rate limit
          await clearRateLimit(rlKey)
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
            role: user.role,
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
      if (user) {
        token.id = user.id
        // role travels in the JWT; read from the authorize payload
        // (NextAuth v4 User type is augmented to carry role)
        token.role = (user as { role?: string }).role ?? 'USER'
      }
      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as string) ?? 'USER'
      }
      return session
    },
  },
}
