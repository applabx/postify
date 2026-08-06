import { Counter, Gauge, Histogram, Registry } from 'prom-client'
import { getSharedRedis } from './redis'
import { getPublishQueue } from './scheduler'
import { readWorkerHeartbeats } from './worker'
import { prisma } from './prisma'

// ─── Prometheus metrics (Phase 4) ────────────────────────────────────────────
// Exposed at GET /api/metrics. Counts and gauges only — no PII, no tokens,
// no user content. Worker heartbeats come from Redis (postify:worker:*), so
// /metrics also proves worker connectivity without polling the orchestrator.

const registry = new Registry()

export const publishPosts = new Counter({
  name: 'postify_publish_posts_total',
  help: 'Publish jobs completed, by final post status',
  labelNames: ['result'] as const,
  registers: [registry],
})

export const publishTargets = new Counter({
  name: 'postify_publish_targets_total',
  help: 'Per-platform publish outcomes',
  labelNames: ['platform', 'result'] as const,
  registers: [registry],
})

export const oauthAttempts = new Counter({
  name: 'postify_oauth_attempts_total',
  help: 'OAuth flow attempts by platform and phase',
  labelNames: ['platform', 'phase', 'result'] as const,
  registers: [registry],
})

export const apiRequests = new Counter({
  name: 'postify_api_requests_total',
  help: 'API requests by route and status class',
  labelNames: ['route', 'method', 'status'] as const,
  registers: [registry],
})

export const apiDurationSeconds = new Histogram({
  name: 'postify_api_duration_seconds',
  help: 'API handler latency',
  labelNames: ['route'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [registry],
})

export const queueJobs = new Gauge({
  name: 'postify_queue_jobs',
  help: 'Bull queue depth by state',
  labelNames: ['state'] as const,
  registers: [registry],
})

export const workerInfo = new Gauge({
  name: 'postify_worker_info',
  help: 'Active publish workers (1 if heartbeat fresh)',
  labelNames: ['id', 'version'] as const,
  registers: [registry],
})

export const workerJobsProcessed = new Gauge({
  name: 'postify_worker_jobs_processed_total',
  help: 'Jobs processed per worker since start',
  labelNames: ['id'] as const,
  registers: [registry],
})

export const processMemoryBytes = new Gauge({
  name: 'nodejs_process_memory_bytes',
  help: 'Process memory by type',
  labelNames: ['type'] as const,
  registers: [registry],
})

export const processCpuSeconds = new Gauge({
  name: 'nodejs_process_cpu_seconds_total',
  help: 'Cumulative process CPU seconds (user+system)',
  registers: [registry],
})

export const redisUp = new Gauge({
  name: 'postify_redis_up',
  help: 'Redis connectivity (1 = ping ok)',
  registers: [registry],
})

export const postgresUp = new Gauge({
  name: 'postify_postgres_up',
  help: 'PostgreSQL connectivity (1 = SELECT 1 ok)',
  registers: [registry],
})

let cpuStart = process.cpuUsage()

export function refreshProcessMetrics(): void {
  const mem = process.memoryUsage()
  processMemoryBytes.set({ type: 'rss' }, mem.rss)
  processMemoryBytes.set({ type: 'heapUsed' }, mem.heapUsed)
  processMemoryBytes.set({ type: 'heapTotal' }, mem.heapTotal)
  processMemoryBytes.set({ type: 'external' }, mem.external)
  const cpu = process.cpuUsage(cpuStart)
  processCpuSeconds.set((cpu.user + cpu.system) / 1_000_000)
  // Reset the base so the gauge reports per-scrape deltas
  cpuStart = process.cpuUsage()
}

async function refreshQueueGauges(): Promise<void> {
  try {
    const queue = getPublishQueue()
    const counts = await queue.getJobCounts()
    for (const [state, n] of Object.entries(counts)) {
      queueJobs.set({ state }, n)
    }
  } catch {
    // Redis/queue unavailable — leave gauges at last known values
  }
}

async function refreshWorkerGauges(): Promise<void> {
  workerInfo.reset()
  workerJobsProcessed.reset()
  const workers = await readWorkerHeartbeats()
  for (const w of workers) {
    workerInfo.set({ id: w.id, version: w.version }, 1)
    workerJobsProcessed.set({ id: w.id }, w.jobsProcessed)
  }
}

async function refreshDependencyGauges(): Promise<void> {
  const redis = await getSharedRedis()
  if (redis) {
    try {
      await redis.ping()
      redisUp.set(1)
    } catch {
      redisUp.set(0)
    }
  } else {
    redisUp.set(0)
  }
  try {
    await prisma.$queryRaw`SELECT 1`
    postgresUp.set(1)
  } catch {
    postgresUp.set(0)
  }
}

// Records API latency + status for a route handler.
export async function withApiMetrics<T extends { status: number }>(
  route: string,
  method: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  try {
    const res = await fn()
    apiRequests.inc({ route, method, status: String(res.status) })
    return res
  } catch (err) {
    apiRequests.inc({ route, method, status: '500' })
    throw err
  } finally {
    apiDurationSeconds.observe({ route }, (Date.now() - start) / 1000)
  }
}

export async function renderMetrics(): Promise<string> {
  refreshProcessMetrics()
  await Promise.all([refreshQueueGauges(), refreshWorkerGauges(), refreshDependencyGauges()])
  return registry.metrics()
}
