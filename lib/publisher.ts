import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/secrets'
import { postToLinkedIn } from '@/lib/oauth/linkedin'
import {
  postToFacebookPage,
  postToFacebookGroup,
  postToInstagram,
  postToThreads,
} from '@/lib/oauth/meta'
import { postTweet, postToBluesky, postToPinterest, postToTumblr, uploadBlueskyBlob } from "@/lib/oauth/platforms"

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

  // Skip targets already marked SUCCESS (prevents duplicate publish on Bull retry)
  const pendingTargets = post.targets.filter((t: any) => t.status !== 'SUCCESS')
  if (pendingTargets.length === 0) {
    return { postId, successCount: post.targets.filter((t: any) => t.status === 'SUCCESS').length, failCount: 0, totalTargets: post.targets.length }
  }

  // Publish to each pending target in parallel (with individual error handling)
  const results = await Promise.allSettled(
    pendingTargets.map((target: any) => publishToTarget(post.text, post.mediaUrls, post.mediaTypes, target))
  )

  // Tally results
  let successCount = 0
  let failCount = 0

  await Promise.all(
    results.map(async (result: any, i: number) => {
      const target = pendingTargets[i]
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
  mediaTypes: string[],
  target: PostTarget & { socialAccount: SocialAccount }
): Promise<string> {
  const acc = target.socialAccount
  const accessToken = decryptSecret(acc.accessToken)
  const refreshToken = acc.refreshToken ? decryptSecret(acc.refreshToken) : null
  const pageToken = acc.pageToken ? decryptSecret(acc.pageToken) : null

  switch (acc.platform) {
    case 'LINKEDIN':
      if (!acc.pageId) {
        throw new Error('LinkedIn personal accounts cannot publish via UGC API. Use a LinkedIn Page instead.')
      }
      return postToLinkedIn({
        accessToken,
        organizationUrn: acc.pageId,
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
        mediaUrls,
        mediaType: mediaUrls.length > 1 ? 'CAROUSEL' : mediaTypes[0] === 'video' ? 'VIDEO' : 'IMAGE',
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

    case 'BLUESKY': {
      let imageBlobs: Array<{ blob: any; alt: string }> | undefined
      if (mediaUrls.length > 0) {
        imageBlobs = await Promise.all(
          mediaUrls.map(async (url) => {
            const imageRes = await fetch(url)
            const buffer = Buffer.from(await imageRes.arrayBuffer())
            const mimeType = imageRes.headers.get('content-type') || 'image/jpeg'
            const blob = await uploadBlueskyBlob({
              accessJwt: accessToken,
              imageBuffer: buffer,
              mimeType,
            })
            return { blob, alt: '' }
          })
        )
      }
      return postToBluesky({
        did: acc.externalId,
        accessJwt: accessToken,
        text,
        imageBlobs,
      })
    }

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
