#!/usr/bin/env node
// ─── Chaos tests (Phase 7) ───────────────────────────────────────────────────
// Scenarios (all use PUBLISH_DRY_RUN=true — no external API calls):
//   sigterm        SIGTERM worker mid-queue → graceful: active jobs finish,
//                  exit 0, zero duplicates
//   sigkill        SIGKILL worker mid-job → DB claim prevents republish,
//                  orphaned PUBLISHING target is never double-published
//   redis-restart  restart Redis mid-queue → jobs resume (AOF persistence)
//   postgres-restart restart PostgreSQL mid-queue → retries recover
//   queue-growth   enqueue 200 jobs → counts + drain verified
//
// Usage: npx tsx scripts/chaos.mjs <scenario>
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scenario = process.argv[2] || 'sigterm'
const DATABASE_URL =
  process.env.CHAOS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postify:postify_dev@localhost:5432/postify'
const REDIS_URL = process.env.CHAOS_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379'
const REDIS_CONTAINER = process.env.CHAOS_REDIS_CONTAINER || 'postify-soak-redis'
const PG_CONTAINER = process.env.CHAOS_PG_CONTAINER || 'postify-chaos-pg'

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function killOrphans() {
  try {
    const { execSync } = await import('node:child_process')
    execSync("pkill -f 'dist/worker/worker.js' || true", { stdio: 'ignore' })
  } catch { /* ignore */ }
}

async function seed(nPosts, targetsPerPost) {
  const email = `chaos-${scenario}-${Date.now()}@test.local`
  const user = await prisma.user.create({ data: { email, name: `Chaos ${scenario}` } })
  const platforms = ['TWITTER', 'FACEBOOK', 'PINTEREST', 'THREADS']
  const accounts = []
  for (let i = 0; i < targetsPerPost; i++) {
    accounts.push(
      await prisma.socialAccount.create({
        data: {
          userId: user.id,
          platform: platforms[i % platforms.length],
          accountType: 'PERSONAL',
          externalId: `ext-${i}`,
          name: `Chaos account ${i}`,
          accessToken: 'enc:chaos',
        },
      })
    )
  }
  const posts = []
  for (let i = 0; i < nPosts; i++) {
    posts.push(
      await prisma.post.create({
        data: {
          userId: user.id,
          text: `Chaos ${scenario} post ${i}`,
          mediaUrls: [],
          mediaTypes: [],
          status: 'SCHEDULED',
          targets: { create: accounts.map((a) => ({ socialAccountId: a.id, status: 'PENDING' })) },
        },
      })
    )
  }
  return { user, posts }
}

function spawnWorker(delayMs) {
  const env = {
    ...process.env,
    PUBLISH_WORKER: 'true',
    PUBLISH_DRY_RUN: 'true',
    PUBLISH_DRY_RUN_DELAY_MS: String(delayMs),
    DATABASE_URL,
    REDIS_URL,
    SOURCE_COMMIT: `chaos-${scenario}`,
    NEXT_PUBLIC_APP_URL: 'https://postify.applabx.com',
    NEXTAUTH_SECRET: 'chaos-secret',
    TOKEN_ENCRYPTION_KEY: 'chaos-key',
    CRON_SECRET: 'chaos-cron',
  }
  const child = spawn('node', [path.join(root, 'dist/worker/worker.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const lines = []
  child.stdout.on('data', (d) => lines.push(String(d)))
  child.stderr.on('data', (d) => lines.push(String(d)))
  return { child, lines }
}

async function enqueue(posts) {
  const { schedulePost } = await import(path.join(root, 'lib/scheduler.ts'))
  for (const p of posts) {
    await schedulePost(p.id, new Date())
  }
}

// Drain = no PENDING targets left and (optionally) only PUBLISHING orphans
// remaining. Bull counters cap at removeOnComplete=100, so the DB is the
// source of truth.
async function waitDrain(userId, expectedTargets, timeoutMs = 180_000, toleratePublishingOrphans = false) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const pending = await prisma.postTarget.count({
        where: { post: { userId }, status: 'PENDING' },
      })
      const terminal = await prisma.postTarget.count({ where: { post: { userId } } })
      const publishing = await prisma.postTarget.count({
        where: { post: { userId }, status: 'PUBLISHING' },
      })
      const satisfied = toleratePublishingOrphans
        ? pending === 0 && terminal >= expectedTargets
        : pending === 0 && publishing === 0 && terminal >= expectedTargets
      if (satisfied) return
    } catch {
      // DB restarting — retry
    }
    await sleep(1500)
  }
  throw new Error('drain timeout: targets not terminal')
}

async function assertClean(userId, expectedTargets) {
  const rows = await prisma.postTarget.findMany({ where: { post: { userId } } })
  const succeeded = rows.filter((t) => t.status === 'SUCCESS')
  const failed = rows.filter((t) => t.status === 'FAILED')
  const publishing = rows.filter((t) => t.status === 'PUBLISHING')
  const pending = rows.filter((t) => t.status === 'PENDING')
  const dupIds = succeeded
    .map((t) => t.externalPostId)
    .filter((id, i, arr) => id && arr.indexOf(id) !== i)

  const result = {
    expectedTargets,
    succeeded: succeeded.length,
    failed: failed.length,
    publishing: publishing.length,
    pending: pending.length,
    duplicatePublishes: dupIds.length,
  }
  console.log('[chaos] assert:', JSON.stringify(result))
  return result
}

async function cleanup(user) {
  try {
    await prisma.post.deleteMany({ where: { userId: user.id } })
    await prisma.socialAccount.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  } catch { /* ignore */ }
}

async function scenarioSigterm() {
  const { user, posts } = await seed(20, 2)
  const worker = spawnWorker(150)
  await sleep(2000)
  await enqueue(posts)
  await sleep(3500) // ~half the jobs in flight
  console.log('[chaos] sending SIGTERM mid-queue')
  worker.child.kill('SIGTERM')
  const exitCode = await new Promise((res) => worker.child.on('exit', res))
  console.log('[chaos] worker exited with code', exitCode)
  await assertClean(user.id, 40)
  // Restart a worker to finish anything still queued
  const w2 = spawnWorker(150)
  await sleep(8000)
  const r2 = await assertClean(user.id, 40)
  w2.child.kill('SIGTERM')
  await new Promise((res) => w2.child.on('exit', res))
  if (exitCode !== 0) throw new Error(`SIGTERM exit code ${exitCode} (expected 0)`)
  if (r2.succeeded !== 40 || r2.duplicatePublishes !== 0) {
    throw new Error(`sigterm assertions failed: ${JSON.stringify(r2)}`)
  }
  await cleanup(user)
  console.log('[chaos] sigterm PASS')
}

async function scenarioSigkill() {
  const { user, posts } = await seed(20, 1)
  const worker = spawnWorker(1500) // slow jobs — kill mid-flight
  await sleep(2000)
  await enqueue(posts)
  await sleep(4000) // several jobs active
  console.log('[chaos] SIGKILL worker mid-job')
  worker.child.kill('SIGKILL')
  await sleep(2000)
  const r1 = await assertClean(user.id, 20)
  const orphanedPublishing = r1.publishing
  // Restart — orphaned PUBLISHING targets must NOT be republished
  const w2 = spawnWorker(100)
  await sleep(15000)
  const r2 = await assertClean(user.id, 20)
  w2.child.kill('SIGTERM')
  await new Promise((res) => w2.child.on('exit', res))
  if (r2.duplicatePublishes !== 0) throw new Error(`sigkill produced duplicates: ${JSON.stringify(r2)}`)
  // The killed job's target either finished (rare) or stays PUBLISHING until
  // the 30-min reconciliation marks it FAILED — never double-published.
  console.log(`[chaos] orphaned PUBLISHING targets after SIGKILL: ${orphanedPublishing}`)
  console.log(`[chaos] after restart: succeeded=${r2.succeeded} publishing=${r2.publishing} (recovery via reconciliation at 30min)`)
  await cleanup(user)
  console.log('[chaos] sigkill PASS (zero duplicates; orphaned targets await reconciliation)')
}

async function scenarioRedisRestart() {
  const { user, posts } = await seed(20, 1)
  const worker = spawnWorker(100)
  await sleep(2000)
  await enqueue(posts)
  await sleep(2000)
  const { execSync } = await import('node:child_process')
  console.log(`[chaos] restarting redis container ${REDIS_CONTAINER}`)
  execSync(`docker restart ${REDIS_CONTAINER}`, { stdio: 'ignore' })
  await waitDrain(user.id, 20, 180_000)
  const r = await assertClean(user.id, 20)
  if (r.succeeded !== 20 || r.duplicatePublishes !== 0) {
    throw new Error(`redis-restart assertions failed: ${JSON.stringify(r)}`)
  }
  worker.child.kill('SIGTERM')
  await new Promise((res) => worker.child.on('exit', res))
  await cleanup(user)
  console.log('[chaos] redis-restart PASS (AOF persistence survived restart)')
}

async function scenarioPostgresRestart() {
  const { user, posts } = await seed(20, 1)
  const worker = spawnWorker(100)
  await sleep(2000)
  await enqueue(posts)
  await sleep(2000)
  const { execSync } = await import('node:child_process')
  console.log(`[chaos] restarting postgres container ${PG_CONTAINER}`)
  execSync(`docker restart ${PG_CONTAINER}`, { stdio: 'ignore' })
  // Wait for the DB to accept connections again
  let dbUp = false
  for (let i = 0; i < 60 && !dbUp; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      dbUp = true
    } catch {
      await sleep(1000)
    }
  }
  console.log(`[chaos] postgres back up after restart (dbUp=${dbUp})`)
  // The worker's Prisma pool may be poisoned by the restart — recycle the
  // worker the way the orchestrator would (restart policy / healthcheck).
  worker.child.kill('SIGTERM')
  await new Promise((res) => worker.child.on('exit', res))
  const w2 = spawnWorker(100)
  // Jobs whose targets were claimed before the restart hold Bull locks
  // (lockDuration 5 min) and are never auto-republished (the DB claim stays
  // PUBLISHING until the 30-min reconciliation marks them FAILED "verify
  // manually"). Unclaimed jobs complete normally. Allow time for lock
  // expiry + stalled-job re-check on top of normal drain.
  await waitDrain(user.id, 20, 600_000, true)

  // Queue-recovery drill: jobs that errored entirely inside the outage
  // window sit in Bull's failed set with PENDING targets. Recovery =
  // re-enqueue (deterministic jobId replaces the failed job) — the same
  // procedure documented for operators in docs/OPERATIONS.md.
  const stuck = await prisma.postTarget.findMany({
    where: { post: { userId: user.id }, status: 'PENDING' },
    select: { postId: true },
  })
  if (stuck.length > 0) {
    console.log(`[chaos] queue recovery: re-enqueueing ${stuck.length} stranded posts`)
    const { schedulePost } = await import(path.join(root, 'lib/scheduler.ts'))
    for (const s of stuck) {
      await schedulePost(s.postId, new Date())
    }
    await waitDrain(user.id, 20, 300_000)
  }

  const r = await assertClean(user.id, 20)
  w2.child.kill('SIGTERM')
  await new Promise((res) => w2.child.on('exit', res))
  // Safety contract: zero duplicate publishes ALWAYS. Remaining PUBLISHING
  // targets are pre-restart orphans awaiting reconciliation — never
  // republished automatically.
  if (r.duplicatePublishes !== 0) {
    throw new Error(`postgres-restart produced duplicates: ${JSON.stringify(r)}`)
  }
  if (r.failed > 0) {
    throw new Error(`postgres-restart left failed targets: ${JSON.stringify(r)}`)
  }
  console.log(
    `[chaos] postgres-restart PASS — succeeded=${r.succeeded}, ` +
    `publishing-orphans=${r.publishing} (await 30-min reconciliation), pending=${r.pending}, duplicates=0`
  )
  await cleanup(user)
}

async function scenarioQueueGrowth() {
  const { user, posts } = await seed(200, 1)
  const worker = spawnWorker(50)
  await sleep(2000)
  await enqueue(posts)
  await waitDrain(user.id, 200, 300_000)
  const r = await assertClean(user.id, 200)
  if (r.succeeded !== 200 || r.duplicatePublishes !== 0) {
    throw new Error(`queue-growth assertions failed: ${JSON.stringify(r)}`)
  }
  worker.child.kill('SIGTERM')
  await new Promise((res) => worker.child.on('exit', res))
  await cleanup(user)
  console.log('[chaos] queue-growth PASS (200 jobs processed, zero duplicates)')
}

async function scenarioMultiWorker() {
  const { user, posts } = await seed(40, 1)
  const w1 = spawnWorker(150)
  const w2 = spawnWorker(150)
  await sleep(2000)
  await enqueue(posts)
  await waitDrain(user.id, 40, 180_000)
  const r = await assertClean(user.id, 40)
  w1.child.kill('SIGTERM')
  w2.child.kill('SIGTERM')
  await Promise.all([
    new Promise((res) => w1.child.on('exit', res)),
    new Promise((res) => w2.child.on('exit', res)),
  ])
  if (r.succeeded !== 40 || r.duplicatePublishes !== 0) {
    throw new Error(`multi-worker assertions failed: ${JSON.stringify(r)}`)
  }
  await cleanup(user)
  console.log('[chaos] multi-worker PASS (2 workers, 40 jobs, zero duplicates)')
}

async function main() {
  await killOrphans()
  const { default: Redis } = await import('ioredis')
  const boot = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 })
  await boot.flushall()
  boot.disconnect()

  console.log(`[chaos] scenario: ${scenario}`)
  switch (scenario) {
    case 'sigterm': return scenarioSigterm()
    case 'sigkill': return scenarioSigkill()
    case 'redis-restart': return scenarioRedisRestart()
    case 'postgres-restart': return scenarioPostgresRestart()
    case 'queue-growth': return scenarioQueueGrowth()
    case 'multi-worker': return scenarioMultiWorker()
    default: throw new Error(`unknown scenario ${scenario}`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error('[chaos] FAILED:', err.message)
    await prisma.$disconnect()
    await killOrphans()
    process.exit(1)
  })
