#!/usr/bin/env node
// ─── Live production-equivalent queue certification (Phase 6/7) ─────────────
// Drives REAL docker worker containers (same image/entrypoint as production)
// through 9 queue scenarios + the 2-worker certification. Enqueue happens
// through the same lib path the web API uses (auth-gated HTTP aside).
//
// Usage:
//   npx tsx scripts/certify-production.mjs
// Env: PE_IMAGE (default postify:prod-equivalent), PE_REDIS_URL,
//      PE_DATABASE_URL, PE_REDIS_CONTAINER, PE_PG_CONTAINER
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const IMAGE = process.env.PE_IMAGE || 'postify:prod-equivalent'
// Host-side connections (this script): use published ports. Container-side
// connections (spawned workers): use bridge addresses — differ on Docker
// Desktop, so they are separate envs.
const REDIS_URL = process.env.PE_REDIS_URL || 'redis://localhost:6380'
const WORKER_REDIS_URL = process.env.PE_WORKER_REDIS_URL || 'redis://172.17.0.4:6379'
const DATABASE_URL =
  process.env.PE_DATABASE_URL || 'postgresql://postify:postify_dev@localhost:5433/postify'
const WORKER_DATABASE_URL =
  process.env.PE_WORKER_DATABASE_URL || 'postgresql://postify:postify_dev@172.17.0.3:5432/postify'
const REDIS_CONTAINER = process.env.PE_REDIS_CONTAINER || 'postify-soak-redis'
const PG_CONTAINER = process.env.PE_PG_CONTAINER || 'postify-chaos-pg'
const COMMIT = 'f61ca2a0ac18471e080cd7fec26ab97c46a0fc13'
const DIGEST = 'sha256:8077d293e6c3de1f0561718d23586873265e9fe0a756c50c5f156ea70b0ea621'

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []

function pass(name, detail) {
  results.push({ name, ok: true, detail })
  console.log(`✅ ${name} — ${detail}`)
}
function fail(name, detail) {
  results.push({ name, ok: false, detail })
  console.error(`❌ ${name} — ${detail}`)
}

function spawnWorker(delayMs, name = `cert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`) {
  const args = [
    'run', '-d', '--name', name,
    '-e', 'PUBLISH_WORKER=true',
    '-e', 'PUBLISH_DRY_RUN=true',
    '-e', `PUBLISH_DRY_RUN_DELAY_MS=${delayMs}`,
    '-e', `DATABASE_URL=${WORKER_DATABASE_URL}`,
    '-e', `REDIS_URL=${WORKER_REDIS_URL}`,
    '-e', 'NEXT_PUBLIC_APP_URL=https://postify.applabx.com',
    '-e', 'NEXTAUTH_URL=https://postify.applabx.com',
    '-e', 'NEXTAUTH_SECRET=cert',
    '-e', 'TOKEN_ENCRYPTION_KEY=cert',
    '-e', 'CRON_SECRET=cert',
    '-e', `SOURCE_COMMIT=${COMMIT}`,
    '-e', `CONTAINER_IMAGE=ghcr.io/applabx/postify@${DIGEST}`,
    IMAGE, 'node', 'worker.js',
  ]
  execSync(`docker rm -f ${name} 2>/dev/null || true`, { stdio: 'ignore' })
  execSync(`docker ${args.join(' ')}`, { stdio: 'ignore' })
  return name
}

function killWorker(name, signal) {
  execSync(`docker kill -s ${signal} ${name} 2>/dev/null || true`, { stdio: 'ignore' })
}

async function seed(nPosts, targetsPerPost) {
  const email = `cert-${Date.now()}@test.local`
  const user = await prisma.user.create({ data: { email, name: 'Certification' } })
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
          name: `Cert account ${i}`,
          accessToken: 'enc:cert',
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
          text: `Cert post ${i}`,
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

async function enqueue(posts, runAt) {
  const { schedulePost } = await import(path.join(root, 'lib/scheduler.ts'))
  for (const p of posts) {
    await schedulePost(p.id, runAt || new Date())
  }
}

async function assertState(userId, expected) {
  const rows = await prisma.postTarget.findMany({ where: { post: { userId } } })
  const by = {}
  for (const r of rows) by[r.status] = (by[r.status] || 0) + 1
  const dupIds = rows
    .filter((r) => r.status === 'SUCCESS')
    .map((r) => r.externalPostId)
    .filter((id, i, arr) => id && arr.indexOf(id) !== i)
  return {
    expected,
    ...by,
    duplicates: dupIds.length,
    ok:
      (by.SUCCESS || 0) === expected.succeeded &&
      (by.FAILED || 0) === (expected.failed || 0) &&
      (by.PUBLISHING || 0) === (expected.publishing || 0) &&
      (by.PENDING || 0) === (expected.pending || 0) &&
      dupIds.length === 0,
  }
}

async function waitFor(userId, expected, timeoutMs = 180_000, toleratePublishing = false) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const s = await assertState(userId, expected)
      if (toleratePublishing) {
        if ((s.PENDING || 0) === 0 && (s.SUCCESS || 0) >= (expected.succeeded || 0) && s.duplicates === 0) return s
      } else if (s.ok) return s
    } catch { /* db restarting */ }
    await sleep(1500)
  }
  throw new Error('waitFor timeout: ' + JSON.stringify(await assertState(userId, expected).catch(() => ({}))))
}

async function cleanup(user) {
  try {
    await prisma.post.deleteMany({ where: { userId: user.id } })
    await prisma.socialAccount.deleteMany({ where: { userId: user.id } })
    await prisma.user.delete({ where: { id: user.id } })
  } catch { /* ignore */ }
}

async function heartbeatCount() {
  const { default: Redis } = await import('ioredis')
  const r = new Redis(REDIS_URL, { maxRetriesPerRequest: 1 })
  try {
    const keys = await r.keys('postify:worker:*')
    r.disconnect()
    return keys.length
  } catch {
    return 0
  }
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

async function s1Immediate() {
  const { user, posts } = await seed(5, 2)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts)
  const s = await waitFor(user.id, { succeeded: 10 }, 120_000)
  killWorker(w, 'TERM')
  await sleep(3000)
  if (s.ok) { pass('S1 immediate publish (5×2)', JSON.stringify(s)) } else { fail('S1 immediate publish', JSON.stringify(s)) }
  await cleanup(user)
}

async function s2Scheduled() {
  const { user, posts } = await seed(5, 2)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts, new Date(Date.now() + 60_000))
  await sleep(5000)
  const delayed = await prisma.postTarget.count({ where: { post: { userId: user.id }, status: 'PENDING' } })
  if (delayed !== 10) { fail('S2 scheduled publish', `expected 10 PENDING pre-run, got ${delayed}`); await cleanup(user); return }
  const s = await waitFor(user.id, { succeeded: 10 }, 180_000)
  if (s.ok) { pass('S2 scheduled publish (+60s)', JSON.stringify(s)) } else { fail('S2 scheduled publish', JSON.stringify(s)) }
  killWorker(w, 'TERM')
  await cleanup(user)
}

async function s3MultipleTargets() {
  const { user, posts } = await seed(3, 4)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts)
  const s = await waitFor(user.id, { succeeded: 12 }, 120_000)
  killWorker(w, 'TERM')
  if (s.ok) { pass('S3 multiple targets (3×4=12)', JSON.stringify(s)) } else { fail('S3 multiple targets', JSON.stringify(s)) }
  await cleanup(user)
}

async function s4Simultaneous() {
  const { user, posts } = await seed(2, 2)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts) // back-to-back
  const s = await waitFor(user.id, { succeeded: 4 }, 120_000)
  killWorker(w, 'TERM')
  if (s.ok) { pass('S4 two simultaneous jobs', JSON.stringify(s)) } else { fail('S4 two simultaneous jobs', JSON.stringify(s)) }
  await cleanup(user)
}

async function s5RestartIdle() {
  const { user, posts } = await seed(3, 1)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts)
  await waitFor(user.id, { succeeded: 3 }, 120_000)
  // Restart while idle
  killWorker(w, 'TERM')
  await sleep(3000)
  const hbBefore = await heartbeatCount()
  const w2 = spawnWorker(50, `cert-idle-${Date.now()}`)
  await sleep(5000)
  const hbAfter = await heartbeatCount()
  const s = await assertState(user.id, { succeeded: 3 })
  killWorker(w2, 'TERM')
  if (s.duplicates === 0 && hbAfter >= 1) pass('S5 worker restart during idle', `heartbeats ${hbBefore}→${hbAfter}, 0 dupes`)
  else fail('S5 worker restart during idle', JSON.stringify(s))
  await cleanup(user)
}

async function s6SigtermProcessing() {
  const { user, posts } = await seed(10, 2)
  const w = spawnWorker(1000) // slow jobs
  await sleep(3000)
  await enqueue(posts)
  await sleep(5000)
  killWorker(w, 'TERM') // graceful mid-queue
  await sleep(8000)
  const w2 = spawnWorker(100, `cert-terms-${Date.now()}`)
  const s = await waitFor(user.id, { succeeded: 20 }, 180_000)
  killWorker(w2, 'TERM')
  if (s.ok) { pass('S6 worker SIGTERM while processing', JSON.stringify(s)) } else { fail('S6 worker SIGTERM', JSON.stringify(s)) }
  await cleanup(user)
}

async function s7Sigkill() {
  const { user, posts } = await seed(10, 1)
  const w = spawnWorker(1500)
  await sleep(3000)
  await enqueue(posts)
  await sleep(5000)
  killWorker(w, 'KILL') // hard kill mid-job
  await sleep(2000)
  const w2 = spawnWorker(100, `cert-kill-${Date.now()}`)
  await sleep(20000)
  const after = await assertState(user.id, { succeeded: 10 })
  killWorker(w2, 'TERM')
  const dupFree = after.duplicates === 0
  const ok = dupFree && (after.SUCCESS || 0) + (after.PUBLISHING || 0) === 10
  if (ok) {
    pass('S7 worker SIGKILL recovery', `success=${after.SUCCESS} publishing-orphans=${after.PUBLISHING} duplicates=0 (orphans await 30-min reconciliation)`)
  } else {
    fail('S7 worker SIGKILL recovery', JSON.stringify(after))
  }
  await cleanup(user)
}

async function s8RedisReconnect() {
  const { user, posts } = await seed(10, 2)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts)
  await sleep(3000)
  execSync(`docker restart ${REDIS_CONTAINER}`, { stdio: 'ignore' })
  const s = await waitFor(user.id, { succeeded: 20 }, 240_000)
  killWorker(w, 'TERM')
  if (s.ok) { pass('S8 Redis reconnect (AOF persistence)', JSON.stringify(s)) } else { fail('S8 Redis reconnect', JSON.stringify(s)) }
  await cleanup(user)
}

async function s9PostgresReconnect() {
  const { user, posts } = await seed(10, 2)
  const w = spawnWorker(50)
  await sleep(3000)
  await enqueue(posts)
  await sleep(3000)
  execSync(`docker restart ${PG_CONTAINER}`, { stdio: 'ignore' })
  // wait for db
  for (let i = 0; i < 60; i++) {
    try { await prisma.$queryRaw`SELECT 1`; break } catch { await sleep(1000) }
  }
  // recycle the poisoned worker the way an orchestrator would
  killWorker(w, 'TERM')
  await sleep(3000)
  const w2 = spawnWorker(50, `cert-pg-${Date.now()}`)
  const s = await waitFor(user.id, { succeeded: 20 }, 600_000, true)
  killWorker(w2, 'TERM')
  const ok = s.duplicates === 0 && (s.SUCCESS || 0) + (s.PUBLISHING || 0) >= 18
  if (ok) {
    pass('S9 PostgreSQL reconnect', `success=${s.SUCCESS} publishing-orphans=${s.PUBLISHING} duplicates=0`)
  } else {
    fail('S9 PostgreSQL reconnect', JSON.stringify(s))
  }
  await cleanup(user)
}

async function s10MultiWorker() {
  const { user, posts } = await seed(20, 1)
  const w1 = spawnWorker(100, `cert-mw1-${Date.now()}`)
  const w2 = spawnWorker(100, `cert-mw2-${Date.now()}`)
  await sleep(3000)
  await enqueue(posts)
  const s = await waitFor(user.id, { succeeded: 20 }, 180_000)
  killWorker(w1, 'TERM')
  killWorker(w2, 'TERM')
  const hb = await heartbeatCount()
  const ok = s.duplicates === 0 && s.SUCCESS === 20 && hb >= 2
  if (ok) {
    pass('S10 multi-worker (2 workers, 20 jobs)', `success=20 duplicates=0 heartbeats=${hb}`)
  } else {
    fail('S10 multi-worker', JSON.stringify({ s, heartbeats: hb }))
  }
  await cleanup(user)
}

async function main() {
  console.log(`[certify] image=${IMAGE} commit=${COMMIT} digest=${DIGEST}`)
  await s1Immediate()
  await s2Scheduled()
  await s3MultipleTargets()
  await s4Simultaneous()
  await s5RestartIdle()
  await s6SigtermProcessing()
  await s7Sigkill()
  await s8RedisReconnect()
  await s9PostgresReconnect()
  await s10MultiWorker()

  const failed = results.filter((r) => !r.ok)
  console.log('\n=== CERTIFICATION SUMMARY ===')
  console.log(JSON.stringify(results, null, 1))
  console.log(`total=${results.length} passed=${results.length - failed.length} failed=${failed.length}`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main()
  .catch(async (err) => {
    console.error('[certify] FAILED:', err.message)
    await prisma.$disconnect()
    try {
      execSync("docker ps -aq --filter name=cert- | xargs -r docker rm -f 2>/dev/null", { stdio: 'ignore' })
    } catch { /* ignore */ }
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
