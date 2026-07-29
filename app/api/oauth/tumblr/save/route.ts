import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/secrets'
import { consumeOAuthData } from '@/lib/oauth-temp-store'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { key: string; selectedBlogs: Array<{ name: string; title?: string }> }
  const { key, selectedBlogs } = body

  const pending = consumeOAuthData<{
    accessToken: string
    accessTokenSecret: string
    blogs: Array<{ name: string; title?: string }>
  }>(key)
  if (!pending) {
    return NextResponse.json({ error: 'Session expired. Please reconnect Tumblr.' }, { status: 400 })
  }

  const { accessToken, accessTokenSecret } = pending

  if (!selectedBlogs?.length) {
    return NextResponse.json({ error: 'No blogs selected' }, { status: 400 })
  }

  const saved = await Promise.all(
    selectedBlogs.map((blog: any) =>
      prisma.socialAccount.upsert({
        where: {
          userId_platform_externalId: {
            userId: session.user.id,
            platform: 'TUMBLR',
            externalId: blog.name,
          },
        },
        update: {
          name: blog.title || blog.name,
          handle: `${blog.name}.tumblr.com`,
          accessToken: encryptSecret(accessToken),
          refreshToken: encryptSecret(accessTokenSecret),
          isActive: true,
        },
        create: {
          userId: session.user.id,
          platform: 'TUMBLR',
          accountType: 'BLOG',
          externalId: blog.name,
          name: blog.title || blog.name,
          handle: `${blog.name}.tumblr.com`,
          accessToken: encryptSecret(accessToken),
          refreshToken: encryptSecret(accessTokenSecret),
        },
      })
    )
  )

  return NextResponse.json({ saved: saved.length })
}
