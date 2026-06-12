import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInstagramAccount, getThreadsProfile } from '@/lib/oauth/meta'
import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/secrets'

async function ensureSessionUser(session: { user: { id: string; email?: string | null; name?: string | null } }) {
  await prisma.user.upsert({
    where: { id: session.user.id },
    update: {
      email: session.user.email ?? undefined,
      name: session.user.name ?? undefined,
    },
    create: {
      id: session.user.id,
      email: session.user.email ?? `${session.user.id}@local.invalid`,
      name: session.user.name ?? session.user.id,
    },
  })
}

type MetaPage = {
  id: string
  name: string
  pictureUrl?: string
  pageAccessToken: string
  instagramAccountId?: string
}

type MetaGroup = {
  id: string
  name: string
  pictureUrl?: string
}

// POST /api/oauth/meta/save
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await ensureSessionUser(session as { user: { id: string; email?: string | null; name?: string | null } })

  const {
    accessToken,
    selectedPageIds,
    selectedGroupIds,
    connectInstagram,
    allPages,
    allGroups,
  } = await req.json() as {
    accessToken: string
    selectedPageIds: string[]
    selectedGroupIds: string[]
    connectInstagram: boolean
    allPages: MetaPage[]
    allGroups: MetaGroup[]
  }

  const saved: string[] = []
  const encryptedAccessToken = encryptSecret(accessToken)

  // ─── Save Facebook Pages ────────────────────────────────────────────────
  const selectedPages = allPages.filter((p) => selectedPageIds.includes(p.id))

  for (const page of selectedPages) {
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: session.user.id,
          platform: 'FACEBOOK',
          externalId: page.id,
        },
      },
      update: {
        name: page.name,
        avatarUrl: page.pictureUrl,
        accessToken: encryptedAccessToken,
        pageToken: encryptSecret(page.pageAccessToken),
        isActive: true,
      },
      create: {
        userId: session.user.id,
        platform: 'FACEBOOK',
        accountType: 'PAGE',
        externalId: page.id,
        name: page.name,
        avatarUrl: page.pictureUrl,
        accessToken: encryptedAccessToken,
        pageToken: encryptSecret(page.pageAccessToken),
      },
    })
    saved.push(`fb_page_${page.id}`)
  }

  // ─── Save Facebook Groups ───────────────────────────────────────────────
  const selectedGroups = allGroups.filter((g) => selectedGroupIds.includes(g.id))

  for (const group of selectedGroups) {
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_externalId: {
          userId: session.user.id,
          platform: 'FACEBOOK',
          externalId: group.id,
        },
      },
      update: {
        name: group.name,
        avatarUrl: group.pictureUrl,
        accessToken: encryptedAccessToken,
        isActive: true,
      },
      create: {
        userId: session.user.id,
        platform: 'FACEBOOK',
        accountType: 'GROUP',
        externalId: group.id,
        name: group.name,
        avatarUrl: group.pictureUrl,
        accessToken: encryptedAccessToken,
      },
    })
    saved.push(`fb_group_${group.id}`)
  }

  // ─── Save Instagram accounts ────────────────────────────────────────────
  if (connectInstagram) {
    const pagesWithIg = allPages.filter((p) => p.instagramAccountId)

    for (const page of pagesWithIg) {
      try {
        // Fetch full Instagram account details
        const igAccount = await getInstagramAccount(page.id, page.pageAccessToken)
        if (!igAccount) continue

        await prisma.socialAccount.upsert({
          where: {
            userId_platform_externalId: {
              userId: session.user.id,
              platform: 'INSTAGRAM',
              externalId: igAccount.id,
            },
          },
          update: {
            name: igAccount.name || igAccount.username,
            handle: igAccount.username,
            avatarUrl: igAccount.profile_picture_url,
            accessToken: encryptedAccessToken,
            pageToken: encryptSecret(page.pageAccessToken),
            isActive: true,
          },
          create: {
            userId: session.user.id,
            platform: 'INSTAGRAM',
            accountType: 'PERSONAL',
            externalId: igAccount.id,
            name: igAccount.name || igAccount.username,
            handle: igAccount.username,
            avatarUrl: igAccount.profile_picture_url,
            accessToken: encryptedAccessToken,
            pageToken: encryptSecret(page.pageAccessToken),
          },
        })
        saved.push(`ig_${igAccount.id}`)

        // ─── Also try to connect Threads (same IG account) ───────────────
        try {
          const threadsProfile = await getThreadsProfile(accessToken)
          if (threadsProfile?.id) {
            await prisma.socialAccount.upsert({
              where: {
                userId_platform_externalId: {
                  userId: session.user.id,
                  platform: 'THREADS',
                  externalId: threadsProfile.id,
                },
              },
              update: {
                name: threadsProfile.name || threadsProfile.username,
                handle: threadsProfile.username,
                avatarUrl: threadsProfile.threads_profile_picture_url,
                accessToken: encryptedAccessToken,
                isActive: true,
              },
              create: {
                userId: session.user.id,
                platform: 'THREADS',
                accountType: 'PERSONAL',
                externalId: threadsProfile.id,
                name: threadsProfile.name || threadsProfile.username,
                handle: threadsProfile.username,
                avatarUrl: threadsProfile.threads_profile_picture_url,
                accessToken: encryptedAccessToken,
              },
            })
            saved.push(`threads_${threadsProfile.id}`)
          }
        } catch {
          // Threads not available for this account — skip silently
        }
      } catch (err) {
        console.error(`Failed to fetch Instagram for page ${page.id}:`, err)
      }
    }
  }

  return NextResponse.json({ saved: saved.length, accounts: saved })
}
