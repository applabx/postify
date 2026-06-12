import Bull from 'bull'
import { publishPost } from './publisher'

// ─── Queue setup ─────────────────────────────────────────────────────────────
let publishQueue: Bull.Queue | null = null

export function getPublishQueue(): Bull.Queue {
  if (!publishQueue) {
    publishQueue = new Bull('postify:publish', {
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    })

    // ─── Process jobs ─────────────────────────────────────────────────────
    publishQueue.process(async (job) => {
      const { postId } = job.data
      console.log(`[Scheduler] Publishing post ${postId}`)
      const result = await publishPost(postId)
      console.log(`[Scheduler] Done: ${result.successCount}/${result.totalTargets} succeeded`)
      return result
    })

    // ─── Event handlers ───────────────────────────────────────────────────
    publishQueue.on('completed', (job, result) => {
      console.log(`[Queue] Job ${job.id} completed`, result)
    })

    publishQueue.on('failed', (job, err) => {
      console.error(`[Queue] Job ${job.id} failed:`, err.message)
    })

    publishQueue.on('stalled', (job) => {
      console.warn(`[Queue] Job ${job.id} stalled`)
    })
  }

  return publishQueue
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
