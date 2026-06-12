import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = (session.user as any).id

  // Date range: last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Run all queries in parallel
  const [
    totalPosts,
    publishedPosts,
    scheduledPosts,
    failedTargets,
    successTargets,
    recentPosts,
    platformBreakdown,
    dailyVolume,
  ] = await Promise.all([
    // Total posts ever
    prisma.post.count({ where: { userId } }),

    // Published in last 30 days
    prisma.post.count({
      where: { userId, status: { in: ['PUBLISHED', 'PARTIAL'] }, publishedAt: { gte: since } },
    }),

    // Currently scheduled
    prisma.post.count({ where: { userId, status: 'SCHEDULED' } }),

    // Failed targets in last 30 days
    prisma.postTarget.count({
      where: {
        status: 'FAILED',
        post: { userId, createdAt: { gte: since } },
      },
    }),

    // Successful targets in last 30 days
    prisma.postTarget.count({
      where: {
        status: 'SUCCESS',
        post: { userId, createdAt: { gte: since } },
      },
    }),

    // Last 5 posts for activity feed
    prisma.post.findMany({
      where: { userId, status: { in: ['PUBLISHED', 'PARTIAL', 'FAILED'] } },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      include: {
        targets: {
          include: {
            socialAccount: { select: { platform: true, name: true } },
          },
        },
      },
    }),

    // Posts per platform (last 30 days, successful only)
    prisma.postTarget.groupBy({
      by: ['socialAccountId'],
      where: {
        status: 'SUCCESS',
        post: { userId, publishedAt: { gte: since } },
      },
      _count: { _all: true },
    }),

    // Daily post volume (last 14 days)
    prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT
        DATE_TRUNC('day', "publishedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh') AS day,
        COUNT(*) AS count
      FROM "Post"
      WHERE "userId" = ${userId}
        AND "status" IN ('PUBLISHED', 'PARTIAL')
        AND "publishedAt" >= ${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ])

  // Enrich platform breakdown with account info
  const accountIds = platformBreakdown.map((r: any) => r.socialAccountId)
  const accounts = await prisma.socialAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, platform: true, name: true },
  })

  const platformStats: Record<string, { platform: string; name: string; count: number }[]> = {}
  for (const row of platformBreakdown as any[]) {
    const acc = accounts.find((a: any) => a.id === row.socialAccountId)
    if (!acc) continue
    if (!platformStats[acc.platform]) platformStats[acc.platform] = []
    platformStats[acc.platform].push({
      platform: acc.platform,
      name: acc.name,
      count: row._count._all,
    })
  }

  // Compute total destinations
  const totalDestinations = successTargets + failedTargets

  // Success rate
  const successRate = totalDestinations > 0
    ? Math.round((successTargets / totalDestinations) * 100)
    : 100

  // Format daily volume for chart
  const chartData = (dailyVolume as Array<{ day: Date; count: bigint }>).map(row => ({
    day: new Date(row.day).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    count: Number(row.count),
  }))

  return NextResponse.json({
    summary: {
      totalPosts,
      publishedLast30: publishedPosts,
      scheduledNow: scheduledPosts,
      successTargets,
      failedTargets,
      totalDestinations,
      successRate,
    },
    platformStats,
    recentPosts: recentPosts.map((p: any) => ({
      id: p.id,
      text: p.text.substring(0, 100),
      status: p.status,
      publishedAt: p.publishedAt,
      destinations: p.targets.length,
      successCount: p.targets.filter((t: any) => t.status === 'SUCCESS').length,
    })),
    chartData,
  })
}
