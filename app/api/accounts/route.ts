import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/accounts — list all connected social accounts for the user
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId: session.user.id, isActive: true },
    select: {
      id: true,
      platform: true,
      accountType: true,
      externalId: true,
      name: true,
      handle: true,
      avatarUrl: true,
      tokenExpiry: true,
      createdAt: true,
      // Never expose accessToken to client
    },
    orderBy: [{ platform: 'asc' }, { name: 'asc' }],
  })

  // Group by platform for the frontend
  const grouped = accounts.reduce((acc: Record<string, any[]>, account: any) => {
    if (!acc[account.platform]) acc[account.platform] = []
    acc[account.platform].push({
      ...account,
      isExpired: account.tokenExpiry ? account.tokenExpiry < new Date() : false,
    })
    return acc
  }, {} as Record<string, any[]>)  // eslint-disable-line

  return NextResponse.json({ accounts, grouped })
}
