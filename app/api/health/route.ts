import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPublishQueue } from '@/lib/scheduler'

// GET /api/health — liveness/readiness + lightweight observability.
// No auth required. Returns 200 if the server is up. When a dependency is
// unhealthy the response remains 200 with the failing component marked so
// orchestrators can keep serving during partial outages (the app degrades
// gracefully: in-memory rate limiting, deferred reconciliation).

function safe<T>(fn: () => Promise<T>): Promise<{ ok: boolean; value?: T; error?: string }> {
  return fn()
    .then((value) => ({ ok: true, value }))
    .catch((e: Error) => ({ ok: false, error: e.message }))
}

export async function GET() {
  const startedAt = Number(process.env.POSTIFY_STARTED_AT || Date.now())
  const uptimeSec = Math.round((Date.now() - startedAt) / 1000)

  const db = await safe(() => prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`)
  const queue = await safe(async () => {
    const q = getPublishQueue()
    const counts = await q.getJobCounts()
    return counts
  })
  const redis = queue.ok

  // Publish metrics — cheap aggregate counts scoped to nothing (public)
  const publish = await safe(async () => {
    const [published24h, failed24h] = await Promise.all([
      prisma.post.count({ where: { status: { in: ['PUBLISHED', 'PARTIAL'] }, publishedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
      prisma.postTarget.count({ where: { status: 'FAILED', publishedAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ])
    return { published24h, failedTargets24h: failed24h }
  })

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commit: process.env.SOURCE_COMMIT || null,
    uptimeSec,
    components: {
      db: db.ok ? 'healthy' : `unhealthy: ${db.error}`,
      redis: redis ? 'healthy' : `unhealthy: ${queue.error}`,
      queue: queue.ok ? 'healthy' : `unhealthy: ${queue.error}`,
      worker: queue.ok ? 'running' : 'degraded',
    },
    queue: queue.value ?? null,
    publish: publish.ok ? publish.value : null,
  })
}
