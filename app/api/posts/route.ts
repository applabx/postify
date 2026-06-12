import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publishPost } from '@/lib/publisher'
import { z } from 'zod'
import { rateLimit, rateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const CreatePostSchema = z.object({
  text: z.string().min(1).max(63206),
  mediaUrls: z.array(z.string().url()).max(10).default([]),
  targetAccountIds: z.array(z.string()).min(1),
  scheduledAt: z.string().datetime().optional(), // ISO string if scheduling
})

// ─── POST /api/posts ──────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit: 10 publishes per minute
  const rl = rateLimit(rateLimitKey(session.user.id, 'publish'), RATE_LIMITS.publish)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before publishing again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  const body = await req.json()
  const parsed = CreatePostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { text, mediaUrls, targetAccountIds, scheduledAt } = parsed.data

  // Verify all target accounts belong to this user
  const accounts = await prisma.socialAccount.findMany({
    where: {
      id: { in: targetAccountIds },
      userId: session.user.id,
      isActive: true,
    },
  })

  if (accounts.length !== targetAccountIds.length) {
    return NextResponse.json(
      { error: 'One or more accounts not found or not owned by you' },
      { status: 403 }
    )
  }

  // Create the post + all target rows in one transaction
  const post = await prisma.post.create({
    data: {
      userId: session.user.id,
      text,
      mediaUrls,
      mediaTypes: mediaUrls.map(() => 'image'),
      status: scheduledAt ? 'SCHEDULED' : 'PUBLISHING',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      targets: {
        create: targetAccountIds.map(accountId => ({
          socialAccountId: accountId,
          status: 'PENDING',
        })),
      },
    },
  })

  // ─── Scheduled post ───────────────────────────────────────────────────────
  if (scheduledAt) {
    const { schedulePost } = await import('@/lib/scheduler')
    const bullJobId = await schedulePost(post.id, new Date(scheduledAt))
    await prisma.scheduledJob.create({
      data: {
        postId: post.id,
        userId: session.user.id,
        bullJobId,
        runAt: new Date(scheduledAt),
      },
    })
    return NextResponse.json({ postId: post.id, status: 'scheduled', bullJobId })
  }

  // ─── Immediate publish ────────────────────────────────────────────────────
  const result = await publishPost(post.id)

  return NextResponse.json({
    postId: post.id,
    status: result.failCount === 0 ? 'published' : result.successCount === 0 ? 'failed' : 'partial',
    successCount: result.successCount,
    failCount: result.failCount,
    totalTargets: result.totalTargets,
  })
}

// ─── GET /api/posts ───────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // "SCHEDULED" | "PUBLISHED" etc.
  const limit = Number(searchParams.get('limit') || '20')
  const page = Number(searchParams.get('page') || '1')

  const posts = await prisma.post.findMany({
    where: {
      userId: session.user.id,
      ...(status && { status: status as any }),
    },
    include: {
      targets: {
        include: {
          socialAccount: {
            select: { id: true, platform: true, name: true, avatarUrl: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: (page - 1) * limit,
  })

  return NextResponse.json({ posts })
}
