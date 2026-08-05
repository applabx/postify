import { prisma } from './prisma'
import { http } from './oauth/http'
import { decryptSecret, encryptSecret } from './secrets'
import { refreshBlueskySession } from './oauth/platforms'

// Run this on a cron job daily: refreshes tokens expiring within 7 days
export async function refreshExpiringTokens() {
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const expiringAccounts = await prisma.socialAccount.findMany({
    where: {
      isActive: true,
      tokenExpiry: { lte: sevenDaysFromNow },
      refreshToken: { not: null },
    },
  })

  console.log(`[TokenRefresh] Found ${expiringAccounts.length} accounts to refresh`)

  for (const account of expiringAccounts) {
    try {
      if (account.platform === 'LINKEDIN') {
        await refreshLinkedInToken(account.id, decryptSecret(account.refreshToken!))
      } else if (account.platform === 'FACEBOOK' || account.platform === 'INSTAGRAM' || account.platform === 'THREADS') {
        await refreshMetaToken(account.id, decryptSecret(account.accessToken))
      } else if (account.platform === 'TWITTER') {
        await refreshTwitterToken(account.id, decryptSecret(account.refreshToken!))
      } else if (account.platform === 'PINTEREST') {
        await refreshPinterestToken(account.id, decryptSecret(account.refreshToken!))
      } else if (account.platform === 'BLUESKY') {
        await refreshBlueskyToken(account.id, decryptSecret(account.refreshToken!))
      }
    } catch (err: any) {
      console.error(`[TokenRefresh] Failed for account ${account.id} (${account.platform}):`, err.message)
      // Mark as expired so user sees the reconnect prompt
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { tokenExpiry: new Date(0) },
      })
    }
  }
}

async function refreshLinkedInToken(accountId: string, refreshToken: string) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
  })

  const res = await http.post('https://www.linkedin.com/oauth/v2/accessToken', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encryptSecret(res.data.access_token),
      refreshToken: encryptSecret(res.data.refresh_token || refreshToken),
      tokenExpiry: new Date(Date.now() + res.data.expires_in * 1000),
    },
  })
  console.log(`[TokenRefresh] LinkedIn refreshed: ${accountId}`)
}

async function refreshMetaToken(accountId: string, currentToken: string) {
  // Meta long-lived tokens can be extended for another 60 days
  const res = await http.get('https://graph.facebook.com/v19.0/oauth/access_token', {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_CLIENT_ID!,
      client_secret: process.env.META_CLIENT_SECRET!,
      fb_exchange_token: currentToken,
    },
  })

  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encryptSecret(res.data.access_token),
      tokenExpiry: new Date(Date.now() + res.data.expires_in * 1000),
    },
  })
  console.log(`[TokenRefresh] Meta refreshed: ${accountId}`)
}

async function refreshTwitterToken(accountId: string, refreshToken: string) {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString('base64')

  const res = await http.post(
    'https://api.twitter.com/2/oauth2/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encryptSecret(res.data.access_token),
      refreshToken: encryptSecret(res.data.refresh_token || refreshToken),
      tokenExpiry: new Date(Date.now() + res.data.expires_in * 1000),
    },
  })
  console.log(`[TokenRefresh] Twitter refreshed: ${accountId}`)
}

async function refreshPinterestToken(accountId: string, refreshToken: string) {
  const credentials = Buffer.from(
    `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`
  ).toString('base64')

  const res = await http.post(
    'https://api.pinterest.com/v5/oauth/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  )

  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encryptSecret(res.data.access_token),
      refreshToken: encryptSecret(res.data.refresh_token || refreshToken),
      tokenExpiry: new Date(Date.now() + res.data.expires_in * 1000),
    },
  })
  console.log(`[TokenRefresh] Pinterest refreshed: ${accountId}`)
}

async function refreshBlueskyToken(accountId: string, refreshJwt: string) {
  const result = await refreshBlueskySession(refreshJwt)

  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      accessToken: encryptSecret(result.accessJwt),
      refreshToken: encryptSecret(result.refreshJwt),
      // Bluesky access JWTs typically last ~2 hours; set a reasonable expiry
      tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  })
  console.log(`[TokenRefresh] Bluesky refreshed: ${accountId}`)
}
