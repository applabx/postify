import Redis from 'ioredis'

// Rate limiter: Redis-backed (cluster-safe, shared across instances) with an
// in-memory fallback for when Redis is unavailable. The synchronous in-memory
// `rateLimit` is retained for backwards compatibility and as the fallback.

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

// ─── Redis client (lazy singleton) ───────────────────────────────────────────
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
      // Swallow — fall back to the in-memory limiter
    })
  } catch {
    return null
  }
  return _redis
}

// ─── In-memory (synchronous fallback / legacy API) ───────────────────────────
export function rateLimit(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    store.set(key, newEntry)
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

// ─── Redis-backed (asynchronous, cluster-safe) ───────────────────────────────
export async function rateLimitAsync(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
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

        // During Redis connection warmup the pipeline result may not be a
        // number; never treat that as a rate-limit hit — fall through to the
        // in-memory limiter.
        if (typeof count !== 'number' || typeof ttl !== 'number') {
          return rateLimit(key, config)
        }

        if (ttl === -1) {
          await redis.pexpire(rlKey, config.windowMs)
        }

        const allowed = count <= config.max
        return {
          allowed,
          remaining: Math.max(0, config.max - count),
          resetAt: Date.now() + (ttl === -1 ? config.windowMs : ttl),
        }
      }
    } catch {
      // Redis unavailable — fall through to in-memory
    }
  }

  return rateLimit(key, config)
}

// Helper to build rate limit key from user + action
export function rateLimitKey(userId: string, action: keyof typeof RATE_LIMITS) {
  return `${action}:${userId}`
}

// For tests/cleanup: close the shared Redis connection so the process can exit.
export async function closeRateLimitRedis(): Promise<void> {
  if (_redis) {
    _redis.disconnect()
    _redis = null
  }
}
