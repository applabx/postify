import Redis from 'ioredis'

// Shared lazy Redis client for operational reads/writes that don't belong to
// Bull or the rate limiter: worker heartbeats, /metrics collection, /api/health
// worker reporting. Never used for request-critical paths (the rate limiter
// keeps its own instance by design).
//
// getSharedRedis() returns a CONNECTED client (or null when Redis is missing).
// Callers must handle null. Commands issued through the returned client never
// queue offline (enableOfflineQueue=false → fail fast instead of hanging).

let _redis: Redis | null = null
let _connectPromise: Promise<Redis | null> | null = null

export async function getSharedRedis(): Promise<Redis | null> {
  if (_redis) return _redis
  if (_connectPromise) return _connectPromise
  _connectPromise = (async () => {
    try {
      const client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      })
      client.on('error', () => {
        // Swallow — callers check connection health via ping/status.
      })
      await client.connect()
      _redis = client
      return _redis
    } catch {
      return null
    }
  })()
  return _connectPromise
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
  _connectPromise = null
}
