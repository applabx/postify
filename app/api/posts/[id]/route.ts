import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/posts/[id]
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const post = await prisma.post.findFirst({
    where: { id, userId: (session.user as any).id },
    include: {
      targets: {
        include: {
          socialAccount: {
            select: { id: true, platform: true, name: true, handle: true, avatarUrl: true },
          },
        },
      },
      scheduledJob: true,
    },
  })

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  return NextResponse.json({ post })
}

// DELETE /api/posts/[id] — cancel a scheduled post
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const post = await prisma.post.findFirst({
    where: { id, userId: (session.user as any).id },
    include: { scheduledJob: true },
  })

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (post.status !== 'SCHEDULED') {
    return NextResponse.json({ error: 'Only scheduled posts can be cancelled' }, { status: 400 })
  }

  // Remove from BullMQ queue
  if (post.scheduledJob?.bullJobId) {
    try {
      const { cancelScheduledPost } = await import('@/lib/scheduler')
      await cancelScheduledPost(post.scheduledJob.bullJobId)
    } catch (err) {
      console.warn('Could not remove BullMQ job:', err)
    }
  }

  // Delete post + cascade deletes targets and scheduledJob
  await prisma.post.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
