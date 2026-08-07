import { prisma } from './prisma'
import { logger } from './logger'
import { getSharedRedis, closeSharedRedis } from './redis'
import { getPublishQueue, registerPublishProcessor } from './scheduler'
import { safeCaptureException } from './sentry'
import { randomUUID } from 'node:crypto'
import './env'

// ─── Dedicated publish worker ────────────────────────────────────────────────
// Runs as a separate process/container (`PUBLISH_WORKER=true`). Multiple
// workers share the queue: Bull distributes jobs between them, and the
// PENDING→PUBLISHING DB claim in lib/publisher guarantees zero duplicate
// publishing even under concurrent workers or crashes.

const WORKER_VERSION = process.env.SOURCE_COMMIT || 'dev'
// Unique per worker instance. Containers share PID 1 and the image sets
// HOSTNAME=0.0.0.0 (Next.js standalone), so neither is unique across
// replicas — fall back to a per-process UUID. POD_NAME is used under
// Kubernetes. Stale heartbeats expire via TTL, so changing IDs across
// restarts is safe.
const WORKER_ID = process.env.POD_NAME || `w-${randomUUID().slice(0, 8)}`
const HEARTBEAT_PREFIX = 'postify:worker:'
const HEARTBEAT_TTL_SECONDS = 45
const HEARTBEAT_INTERVAL_MS = 15_000

let jobsProcessed = 0

export interface WorkerHeartbeat {
  id: string
  version: string
  startedAt: string
  lastHeartbeat: string
  jobsProcessed: number
  rssMb: number
}

function heartbeatPayload(): WorkerHeartbeat {
  return {
    id: WORKER_ID,
    version: WORKER_VERSION,
    startedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    jobsProcessed,
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
  }
}

async function writeHeartbeat(): Promise<void> {
  const redis = await getSharedRedis()
  if (!redis) return
  try {
    const key = `${HEARTBEAT_PREFIX}${WORKER_ID}`
    const payload = heartbeatPayload()
    payload.startedAt = new Date().toISOString()
    await redis.set(key, JSON.stringify(payload), 'EX', HEARTBEAT_TTL_SECONDS)
  } catch (err) {
    console.error('[Worker] heartbeat write failed:', (err as Error).message)
  }
}

// Reads all live worker heartbeats (used by /api/health and /metrics).
export async function readWorkerHeartbeats(): Promise<WorkerHeartbeat[]> {
  const redis = await getSharedRedis()
  if (!redis) return []
  try {
    const keys = await redis.keys(`${HEARTBEAT_PREFIX}*`)
    if (keys.length === 0) return []
    const values = await redis.mget(keys)
    const now = Date.now()
    const out: WorkerHeartbeat[] = []
    for (let i = 0; i < keys.length; i++) {
      const raw = values[i]
      if (!raw) continue
      try {
        const hb = JSON.parse(raw) as WorkerHeartbeat
        if (now - new Date(hb.lastHeartbeat).getTime() < HEARTBEAT_TTL_SECONDS * 1000) {
          out.push(hb)
        }
      } catch {
        // ignore malformed heartbeat keys
      }
    }
    return out
  } catch {
    return []
  }
}

export async function startWorker(): Promise<void> {
  logger.info('worker_start', { version: WORKER_VERSION, workerId: WORKER_ID })

  const queue = getPublishQueue()
  registerPublishProcessor(queue)

  // Track processed jobs for the heartbeat
  queue.on('completed', () => {
    jobsProcessed++
  })
  queue.on('failed', () => {
    jobsProcessed++
  })

  await writeHeartbeat()
  const hb = setInterval(() => void writeHeartbeat(), HEARTBEAT_INTERVAL_MS)
  hb.unref()

  // ─── Graceful shutdown ─────────────────────────────────────────────────
  // SIGTERM (orchestrator stop / rolling deploy):
  //   1. pause the local worker — no new jobs accepted
  //   2. wait for active publishes to finish (Bull resolves pause once the
  //      active queue drains)
  //   3. close Bull/Redis connections
  //   4. disconnect Prisma
  //   5. exit 0
  // A hard 25s cap guarantees termination before Coolify's SIGKILL.
  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('worker_shutdown_start', { signal, jobsProcessed })

    clearInterval(hb)
    const force = setTimeout(() => {
      logger.warn('worker_shutdown_force_exit', { signal })
      process.exit(0)
    }, 25_000)
    force.unref()

    try {
      // Wait for active jobs to finish before closing connections.
      await queue.pause(true)
      logger.info('worker_shutdown_active_drained', { jobsProcessed })
    } catch (err) {
      logger.error('worker_shutdown_pause_error', { error: (err as Error).message })
    }

    try {
      await queue.close()
    } catch (err) {
      logger.error('worker_shutdown_queue_close_error', { error: (err as Error).message })
    }

    try {
      await prisma.$disconnect()
    } catch (err) {
      logger.error('worker_shutdown_prisma_error', { error: (err as Error).message })
    }

    try {
      await closeSharedRedis()
    } catch {
      // ignore
    }

    logger.info('worker_shutdown_complete', { signal, jobsProcessed })
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  // ─── Crash capture ─────────────────────────────────────────────────────
  process.on('uncaughtException', (err) => {
    logger.error('worker_uncaught_exception', { error: err.message, stack: err.stack ?? '' })
    safeCaptureException(err, { worker: 'publish', phase: 'uncaughtException' })
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error('worker_unhandled_rejection', { error: err.message })
    safeCaptureException(err, { worker: 'publish', phase: 'unhandledRejection' })
    process.exit(1)
  })

  logger.info('worker_ready', { workerId: WORKER_ID })
}
