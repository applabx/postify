import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/secrets'
import { postToLinkedIn } from '@/lib/oauth/linkedin'
import {
  postToFacebookPage,
  postToFacebookGroup,
  postToInstagram,
  postToThreads,
} from '@/lib/oauth/meta'
import { postTweet, postToBluesky, postToPinterest, postToTumblr } from "@/lib/oauth/platforms"

type SocialAccount = {
  id: string; platform: string; accountType: string; externalId: string
  name: string; handle?: string | null; accessToken: string
  refreshToken?: string | null; pageId?: string | null; pageToken?: string | null
}
type PostTarget = { id: string; socialAccount: SocialAccount }

// ─────────────────────────────────────────────────────────────────────────────
// Main publish function — called for both "Publish Now" and scheduled jobs
// ─────────────────────────────────────────────────────────────────────────────

export async function publishPost(postId: string): Promise<PublishResult> {
  // Load post with all its targets and their social accounts
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      targets: {
        include: { socialAccount: true },
      },
    },
  })

  if (!post) throw new Error(`Post ${postId} not found`)

  // Mark post as publishing
  await prisma.post.update({
    where: { id: postId },
    data: { status: 'PUBLISHING' },
  })

  // Publish to each target in parallel (with individual error handling)
  const results = await Promise.allSettled(
    post.targets.map((target: any) => publishToTarget(post.text, post.mediaUrls, target))
  )

  // Tally results
  let successCount = 0
  let failCount = 0

  await Promise.all(
    results.map(async (result: any, i: number) => {
      const target = post.targets[i]
      if (result.status === 'fulfilled') {
        successCount++
        await prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: 'SUCCESS',
            externalPostId: result.value,
            publishedAt: new Date(),
          },
        })
      } else {
        failCount++
        console.error(`Failed to post to ${target.socialAccount.platform}:`, result.reason)
        await prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: 'FAILED',
            errorMessage: result.reason?.message || 'Unknown error',
          },
        })
      }
    })
  )

  // Set overall post status
  const finalStatus =
    failCount === 0 ? 'PUBLISHED' : successCount === 0 ? 'FAILED' : 'PARTIAL'

  await prisma.post.update({
    where: { id: postId },
    data: { status: finalStatus, publishedAt: new Date() },
  })

  return { postId, successCount, failCount, totalTargets: post.targets.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Route to the correct platform publisher
// ─────────────────────────────────────────────────────────────────────────────

async function publishToTarget(
  text: string,
  mediaUrls: string[],
  target: PostTarget & { socialAccount: SocialAccount }
): Promise<string> {
  const acc = target.socialAccount
  const accessToken = decryptSecret(acc.accessToken)
  const refreshToken = acc.refreshToken ? decryptSecret(acc.refreshToken) : null
  const pageToken = acc.pageToken ? decryptSecret(acc.pageToken) : null

  switch (acc.platform) {
    case 'LINKEDIN':
      return postToLinkedIn({
        accessToken,
        organizationUrn: acc.pageId!, // urn:li:organization:XXXXX
        text,
      })

    case 'FACEBOOK':
      if (acc.accountType === 'GROUP') {
        return postToFacebookGroup({
          groupId: acc.externalId,
          userAccessToken: accessToken,
          message: text,
        })
      } else {
        return postToFacebookPage({
          pageId: acc.externalId,
          pageAccessToken: pageToken || accessToken,
          message: text,
          mediaUrls,
        })
      }

    case 'INSTAGRAM':
      if (!mediaUrls.length) {
        throw new Error('Instagram requires at least one image')
      }
      return postToInstagram({
        igAccountId: acc.externalId,
        pageAccessToken: pageToken || accessToken,
        caption: text,
        mediaUrl: mediaUrls[0],
      })

    case 'TWITTER':
      return postTweet({ accessToken, text })

    case 'THREADS':
      return postToThreads({
        threadsUserId: acc.externalId,
        accessToken,
        text,
        mediaUrl: mediaUrls[0],
      })

    case 'BLUESKY':
      return postToBluesky({
        did: acc.externalId,
        accessJwt: accessToken,
        text,
      })

    case 'PINTEREST':
      if (!mediaUrls.length) throw new Error('Pinterest requires an image')
      return postToPinterest({
        accessToken,
        boardId: acc.pageId || acc.externalId,
        title: text.substring(0, 100),
        description: text,
        mediaUrl: mediaUrls[0],
      })

    case 'TUMBLR':
      return postToTumblr({
        accessToken,
        accessTokenSecret: refreshToken!,
        blogIdentifier: acc.handle || acc.externalId,
        content: text,
        mediaUrls,
      })

    default:
      throw new Error(`Unsupported platform: ${acc.platform}`)
  }
}

export interface PublishResult {
  postId: string
  successCount: number
  failCount: number
  totalTargets: number
}
