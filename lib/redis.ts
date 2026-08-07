import Redis from 'ioredis'

// Shared lazy Redis client for operational reads/writes that don't belong to
// Bull or the rate limiter: worker heartbeats, /metrics collection, /api/health
// worker reporting. Never used for request-critical paths (the rate limiter
// keeps its own instance by design).
//
// getSharedRedis() returns a CONNECTED client (or null when Redis is missing).
// Callers must handle null. Commands issued through the returned client never
// queue offline (enableOfflineQueue=false → fail fast instead of hanging).
//
// Connection policy: fail fast (≤3 attempts, ≤1s spacing) so a transient
// first-attempt failure (e.g. IPv6-first DNS inside containers) does not
// poison the cached promise — a failed attempt resets the cache and the next
// caller retries.

let _redis: Redis | null = null
let _connecting: Promise<Redis | null> | null = null

export async function getSharedRedis(): Promise<Redis | null> {
  if (_redis) return _redis
  if (!_connecting) {
    _connecting = (async () => {
      try {
        // Normalize localhost → 127.0.0.1: inside containers `localhost`
        // can resolve to ::1 first, and ioredis can wedge its connect()
        // promise there (observed in image testing). Bull uses the raw
        // URL, so production hostnames are untouched.
        const rawUrl = process.env.REDIS_URL || 'redis://localhost:6379'
        const url = rawUrl.replace(/redis:\/\/localhost(?=[:/])/, 'redis://127.0.0.1')
        const client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          family: 4,
          retryStrategy: (times) => (times < 3 ? Math.min(times * 200, 1000) : null),
        })
        client.on('error', () => {
          // Swallow — callers check connection health via ping/status.
        })
        await client.connect()
        _redis = client
        return _redis
      } catch (err) {
        console.error('[Redis] shared client connect failed:', (err as Error).message)
        _connecting = null
        return null
      }
    })()
  }
  return _connecting
}

export async function closeSharedRedis(): Promise<void> {
  if (_redis) {
    try {
      _redis.disconnect()
    } catch {
      // ignore
    }
    _redis = null
  }
  _connecting = null
}
