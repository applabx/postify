#!/usr/bin/env node
// ─── Soak test (Phase 7) ─────────────────────────────────────────────────────
// Continuous publishing through the real queue + real dedicated worker
// (dist/worker/worker.js) with PUBLISH_DRY_RUN=true (no external API calls).
//
// Verifies:
//   - N posts × targets all publish exactly once (SUCCESS, no duplicates)
//   - queue drains to zero
//   - worker graceful shutdown on SIGTERM (exit 0, active jobs finished)
//   - memory stability (RSS sampled during the run)
//   - CPU consumed
//
// Usage:
//   docker run -d --name postify-soak-redis -p 6379:6379 redis:7-alpine --appendonly yes
//   npx tsx scripts/soak.mjs [posts] [targets-per-post] [delay-ms]
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const N = Number(process.argv[2] || 20)
const TARGETS = Number(process.argv[3] || 2)
const DELAY_MS = Number(process.argv[4] || 150)
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postify:postify_dev@localhost:5432/postify'
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })

async function seed() {
  const email = `soak-${Date.now()}@test.local`
  const user = await prisma.user.create({
    data: { email, name: 'Soak Test' },
  })
  const accounts = []
  for (let i = 0; i < TARGETS; i++) {
    const platforms = ['TWITTER', 'FACEBOOK', 'PINTEREST', 'THREADS']
    accounts.push(
      await prisma.socialAccount.create({
        data: {
          userId: user.id,
          platform: platforms[i % platforms.length],
          accountType: 'PERSONAL',
          externalId: `ext-${i}`,
          name: `Soak account ${i}`,
          accessToken: 'enc:soak', // never decrypted in dry-run mode
        },
      })
    )
  }
  const posts = []
  for (let i = 0; i < N; i++) {
    posts.push(
      await prisma.post.create({
        data: {
          userId: user.id,
          text: `Soak post ${i} — ${'x'.repeat(120)}`,
          mediaUrls: [],
          mediaTypes: [],
          status: 'SCHEDULED',
          targets: {
            create: accounts.map((a) => ({ socialAccountId: a.id, status: 'PENDING' })),
          },
        },
        include: { targets: true },
      })
    )
  }
  return { user, accounts, posts }
}

async function main() {
  // Fresh queue: the soak redis is dedicated to this harness. Kill any
  // orphaned workers from previous interrupted runs (multi-worker is safe —
  // the DB claim prevents duplicates — but a clean slate makes results clear).
  await killOrphans()
  await new Promise((r) => setTimeout(r, 500))

  const { default: Redis } = await import('ioredis')
  const boot = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 })
  await boot.flushall()
  boot.disconnect()

  const { user, posts } = await seed()
  console.log(`[soak] seeded ${posts.length} posts x ${TARGETS} targets (user ${user.id})`)

  const workerEnv = {
    ...process.env,
    PUBLISH_WORKER: 'true',
    PUBLISH_DRY_RUN: 'true',
    PUBLISH_DRY_RUN_DELAY_MS: String(DELAY_MS),
    DATABASE_URL,
    REDIS_URL,
    SOURCE_COMMIT: 'soak-test',
    NEXT_PUBLIC_APP_URL: 'https://postify.applabx.com',
    NEXTAUTH_SECRET: 'soak-secret',
    TOKEN_ENCRYPTION_KEY: 'soak-key',
    CRON_SECRET: 'soak-cron',
  }

  console.log(`[soak] starting dedicated worker (dist/worker/worker.js)`)
  const worker = spawn('node', [path.join(root, 'dist/worker/worker.js')], {
    env: workerEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  worker.stdout.on('data', (d) => process.stdout.write(`[worker] ${d}`))
  worker.stderr.on('data', (d) => process.stderr.write(`[worker:err] ${d}`))

  await new Promise((r) => setTimeout(r, 2500))

  // Enqueue all posts through the real scheduling API
  const { schedulePost } = await import(path.join(root, 'lib/scheduler.ts'))
  const start = Date.now()
  for (const p of posts) {
    await schedulePost(p.id, new Date())
  }
  console.log(`[soak] enqueued ${posts.length} jobs`)

  // Memory sampling of the worker (from its own heartbeat in Redis)
  const rssSamples = []
  const hbRedis = new (await import('ioredis')).default(REDIS_URL, { maxRetriesPerRequest: 1 })
  const sampler = setInterval(async () => {
    try {
      const keys = await hbRedis.keys('postify:worker:*')
      const vals = await hbRedis.mget(keys)
      for (const v of vals) {
        if (!v) continue
        const hb = JSON.parse(v)
        if (typeof hb.rssMb === 'number' && hb.rssMb > 0) rssSamples.push(hb.rssMb)
      }
    } catch { /* ignore */ }
  }, 2000)

  // Wait for drain
  const { getPublishQueue } = await import(path.join(root, 'lib/scheduler.ts'))
  const queue = getPublishQueue()
  const deadline = Date.now() + 5 * 60_000
  let counts
  do {
    counts = await queue.getJobCounts()
    const done = counts.completed + counts.failed
    const todo = counts.waiting + counts.active + counts.delayed
    console.log(`[soak] waiting=${counts.waiting} active=${counts.active} completed=${counts.completed} failed=${counts.failed} delayed=${counts.delayed}`)
    if (todo === 0 && done >= posts.length) break
    if (Date.now() > deadline) throw new Error('soak timeout: queue did not drain')
    await new Promise((r) => setTimeout(r, 2000))
  } while (true)
  clearInterval(sampler)

  const durationMs = Date.now() - start
  const cpu = process.cpuUsage()

  // Verify exactly-once semantics
  const rows = await prisma.postTarget.findMany({
    where: { post: { userId: user.id } },
  })
  const succeeded = rows.filter((t) => t.status === 'SUCCESS')
  const orphaned = rows.filter((t) => t.status === 'PUBLISHING')
  const failed = rows.filter((t) => t.status === 'FAILED')
  const dupIds = succeeded
    .map((t) => t.externalPostId)
    .filter((id, i, arr) => id && arr.indexOf(id) !== i)

  if (succeeded.length !== posts.length * TARGETS) {
    throw new Error(`expected ${posts.length * TARGETS} SUCCESS targets, got ${succeeded.length} (failed=${failed.length}, orphaned=${orphaned.length})`)
  }
  if (dupIds.length > 0) throw new Error(`DUPLICATE publishes detected: ${dupIds.length}`)
  if (failed.length > 0) throw new Error(`unexpected failures: ${failed.length}`)
  if (orphaned.length > 0) throw new Error(`orphaned PUBLISHING targets: ${orphaned.length}`)

  const rssMax = Math.max(...rssSamples)
  const rssMin = Math.min(...rssSamples)
  hbRedis.disconnect()

  // Graceful shutdown check
  const beforeExit = Date.now()
  const exitPromise = new Promise((resolve) => worker.on('exit', (code) => resolve(code)))
  worker.kill('SIGTERM')
  const exitCode = await exitPromise
  const shutdownMs = Date.now() - beforeExit

  console.log('=== SOAK RESULTS ===')
  console.log(JSON.stringify({
    posts: posts.length,
    targetsPerPost: TARGETS,
    delayMs: DELAY_MS,
    succeeded: succeeded.length,
    failed: failed.length,
    duplicatePublishes: dupIds.length,
    queueDrainSeconds: Math.round(durationMs / 1000),
    workerShutdownMs: shutdownMs,
    workerExitCode: exitCode,
    rssMinMb: Math.round(rssMin * 10) / 10,
    rssMaxMb: Math.round(rssMax * 10) / 10,
    rssDeltaMb: Math.round((rssMax - rssMin) * 10) / 10,
    processCpuUserMs: Math.round(cpu.user / 1000),
    processCpuSystemMs: Math.round(cpu.system / 1000),
  }, null, 2))

  if (exitCode !== 0) throw new Error(`worker exit code ${exitCode} after SIGTERM (expected 0)`)

  // Cleanup
  await prisma.post.deleteMany({ where: { userId: user.id } })
  await prisma.socialAccount.deleteMany({ where: { userId: user.id } })
  await prisma.user.delete({ where: { id: user.id } })
  console.log('[soak] cleanup done')
  // Bull/Redis handles keep the event loop alive — exit explicitly
  process.exit(0)
}


async function killOrphans() {
  try {
    const { execSync } = await import('node:child_process')
    execSync("pkill -f 'dist/worker/worker.js' || true", { stdio: 'ignore' })
  } catch { /* ignore */ }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('[soak] FAILED:', err.message)
    await prisma.$disconnect()
    await killOrphans()
    process.exit(1)
  })
