import Bull from 'bull'
import { prisma } from './prisma'
import { publishPost } from './publisher'

// ─── Queue setup ─────────────────────────────────────────────────────────────
let publishQueue: Bull.Queue | null = null

function initQueue(): Bull.Queue {
  const queue = new Bull('postify:publish', {
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  })

  // ─── Process jobs ─────────────────────────────────────────────────────
  queue.process(async (job) => {
    const { postId } = job.data
    console.log(`[Scheduler] Publishing post ${postId}`)
    const result = await publishPost(postId)
    console.log(`[Scheduler] Done: ${result.successCount}/${result.totalTargets} succeeded`)
    return result
  })

  // ─── Event handlers ───────────────────────────────────────────────────
  queue.on('completed', (job, result) => {
    console.log(`[Queue] Job ${job.id} completed`, result)
  })

  queue.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job.id} failed:`, err.message)
  })

  queue.on('stalled', (job) => {
    console.warn(`[Queue] Job ${job.id} stalled`)
  })

  return queue
}

export function getPublishQueue(): Bull.Queue {
  if (!publishQueue) {
    publishQueue = initQueue()
  }
  return publishQueue
}

// ─── Scheduled-job reconciliation ────────────────────────────────────────────
// Recreates BullMQ jobs for SCHEDULED posts that are missing from Redis.
// Safe to run on every startup: uses deterministic jobIds (post:<postId>),
// so duplicate jobs are never created.

async function reconcileScheduledJobs(): Promise<void> {
  const queue = getPublishQueue()
  const now = new Date()

  try {
    const posts = await prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { gt: now },
      },
      include: { scheduledJob: true },
    })

    console.log(`[Scheduler] Reconciliation: found ${posts.length} future scheduled posts`)

    let recovered = 0
    let skipped = 0
    let failed = 0

    for (const post of posts) {
      try {
        const scheduledJob = post.scheduledJob
        const existingJobId = scheduledJob?.bullJobId
        if (existingJobId) {
          const existingJob = await queue.getJob(existingJobId)
          if (existingJob) {
            skipped++
            continue
          }
        }

        // Recreate the Bull job (deterministic jobId prevents duplicates)
        const jobId = await schedulePost(post.id, post.scheduledAt!)

        // If the ScheduledJob DB row is missing (edge case), create it
        if (!scheduledJob) {
          await prisma.scheduledJob.create({
            data: {
              postId: post.id,
              userId: post.userId,
              bullJobId: jobId,
              runAt: post.scheduledAt!,
            },
          })
        }
        recovered++
      } catch (err) {
        failed++
        console.error(`[Scheduler] Reconciliation failed for post ${post.id}:`, err)
      }
    }

    console.log(
      `[Scheduler] Reconciliation done: ${recovered} recovered, ${skipped} skipped, ${failed} failed`
    )
  } catch (err) {
    // Redis or DB unavailable — log and continue without crashing the app
    console.error('[Scheduler] Reconciliation skipped (Redis or DB unavailable):', err)
  }
}

// Eagerly initialize the queue so the processor is registered on server start
// (guarded: don't run during build, only at runtime)
if (typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
  getPublishQueue()
  reconcileScheduledJobs()
}

// ─── Schedule a post ─────────────────────────────────────────────────────────
export async function schedulePost(postId: string, runAt: Date): Promise<string> {
  const queue = getPublishQueue()
  const delay = Math.max(0, runAt.getTime() - Date.now())

  const job = await queue.add(
    { postId },
    { delay, jobId: `post:${postId}` }
  )

  return String(job.id)
}

// ─── Cancel a scheduled post ─────────────────────────────────────────────────
export async function cancelScheduledPost(bullJobId: string): Promise<void> {
  const queue = getPublishQueue()
  const job = await queue.getJob(bullJobId)
  if (job) await job.remove()
}
