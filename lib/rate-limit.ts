// Simple in-memory rate limiter
// For production with multiple instances, use Redis instead

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export interface RateLimitConfig {
  windowMs: number  // Time window in milliseconds
  max: number       // Max requests per window
}

// Default limits
export const RATE_LIMITS = {
  // Publishing: max 10 posts per minute per user
  publish: { windowMs: 60_000, max: 10 },
  // OAuth: max 5 connect attempts per 5 minutes
  oauth: { windowMs: 5 * 60_000, max: 5 },
  // Upload: max 20 files per minute
  upload: { windowMs: 60_000, max: 20 },
  // API general: max 100 requests per minute
  api: { windowMs: 60_000, max: 100 },
} satisfies Record<string, RateLimitConfig>

export function rateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    // New window
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    store.set(key, newEntry)
    // Clean up old entries periodically
    if (store.size > 10_000) pruneStore(now)
    return { allowed: true, remaining: config.max - 1, resetAt: newEntry.resetAt }
  }

  if (entry.count >= config.max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: config.max - entry.count, resetAt: entry.resetAt }
}

function pruneStore(now: number) {
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}

// Helper to build rate limit key from user + action
export function rateLimitKey(userId: string, action: keyof typeof RATE_LIMITS) {
  return `${action}:${userId}`
}
