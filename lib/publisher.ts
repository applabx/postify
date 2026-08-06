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
import { validateMediaUrlDns } from "@/lib/media-url"
import { publishPosts, publishTargets } from '@/lib/metrics'
import { safeCaptureException } from '@/lib/sentry'

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

  // ─── Publish state machine ──────────────────────────────────────────────
  // Exactly-once-as-possible:
  //  1. Claim: atomically transition PENDING -> PUBLISHING. If the claim
  //     fails (row no longer PENDING), another worker already owns it or it
  //     was finalized — skip it. This makes concurrent/duplicate job
  //     processing safe at the database level.
  //  2. Publish: call the platform.
  //  3. Finalize: SUCCESS or FAILED.
  //  4. Recovery: targets left in PUBLISHING (crash between claim and
  //     finalize) are marked FAILED by startup reconciliation with an
  //     explicit "verify manually" message — never auto-republished, which
  //     is what would create duplicates when the platform accepted the post
  //     but the response was lost.
  const pendingTargets = post.targets.filter((t: any) => t.status === 'PENDING')
  if (pendingTargets.length === 0) {
    return { postId, successCount: post.targets.filter((t: any) => t.status === 'SUCCESS').length, failCount: 0, totalTargets: post.targets.length }
  }

  const results = await Promise.allSettled(
    pendingTargets.map(async (target: any) => {
      const claim = await prisma.postTarget.updateMany({
        where: { id: target.id, status: 'PENDING' },
        data: { status: 'PUBLISHING' },
      })
      if (claim.count === 0) {
        // Lost the claim (concurrent worker or prior finalization) — skip.
        return { skipped: true, targetId: target.id }
      }
      try {
        const externalId = await publishToTarget(post.text, post.mediaUrls, post.mediaTypes, target)
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: 'SUCCESS', externalPostId: externalId, publishedAt: new Date() },
        })
        publishTargets.inc({ platform: target.socialAccount.platform, result: 'success' })
        return { ok: true, targetId: target.id }
      } catch (err: unknown) {
        const reason = err as { message?: string; response?: { status?: number } }
        console.error(
          `Failed to post to ${target.socialAccount.platform}: ` +
          `${reason?.message ?? 'Unknown error'}` +
          (reason?.response?.status ? ` (HTTP ${reason.response.status})` : '')
        )
        publishTargets.inc({ platform: target.socialAccount.platform, result: 'failure' })
        safeCaptureException(err, {
          phase: 'publish-target',
          platform: target.socialAccount.platform,
          postId,
        })
        await prisma.postTarget.update({
          where: { id: target.id },
          data: { status: 'FAILED', errorMessage: reason?.message || 'Unknown error' },
        })
        return { ok: false, targetId: target.id, error: err as Error }
      }
    })
  )

  // Tally results
  let successCount = 0
  let failCount = 0
  for (const r of results) {
    if (r.status === 'rejected') {
      failCount++
      continue
    }
    if (r.value.skipped) continue
    if (r.value.ok) successCount++
    else failCount++
  }

  // Set overall post status
  const finalStatus =
    failCount === 0 ? 'PUBLISHED' : successCount === 0 ? 'FAILED' : 'PARTIAL'

  await prisma.post.update({
    where: { id: postId },
    data: { status: finalStatus, publishedAt: new Date() },
  })

  publishPosts.inc({ result: finalStatus })

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

  // ─── Dry-run mode (soak/chaos/staging) ─────────────────────────────────
  // PUBLISH_DRY_RUN=true short-circuits the platform call: the full queue,
  // claim, and finalize state machine still runs, but nothing is sent to
  // external APIs. Used by the soak/chaos harness and staging environments.
  // PUBLISH_DRY_RUN_DELAY_MS simulates platform latency for realistic tests.
  if (process.env.PUBLISH_DRY_RUN === 'true') {
    const delayMs = Number(process.env.PUBLISH_DRY_RUN_DELAY_MS || 0)
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs))
    }
    return `dry-run:${acc.platform}:${target.id}:${Date.now()}`
  }

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
            // SSRF defense in depth: re-validate DNS at publish time in case
            // the hostname changed since the post was created (rebinding).
            const dnsErr = await validateMediaUrlDns(url)
            if (dnsErr) throw new Error(`Media URL rejected at publish time: ${dnsErr}`)
            // Reliability: hard timeout + abort support on the download.
            const imageRes = await fetch(url, { signal: AbortSignal.timeout(30_000) })
            if (!imageRes.ok) {
              throw new Error(`Failed to download media for Bluesky: HTTP ${imageRes.status}`)
            }
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
