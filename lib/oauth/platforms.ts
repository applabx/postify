import axios from 'axios'

// ─────────────────────────────────────────────────────────────────────────────
// TWITTER / X
// ─────────────────────────────────────────────────────────────────────────────

const TWITTER_API = 'https://api.twitter.com/2'

export function getTwitterAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TWITTER_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/twitter/callback`,
    scope: 'tweet.read tweet.write users.read offline.access',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return `https://twitter.com/i/oauth2/authorize?${params}`
}

export async function exchangeTwitterCode(code: string, codeVerifier: string) {
  const credentials = Buffer.from(
    `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
  ).toString('base64')

  const res = await axios.post(
    `${TWITTER_API}/oauth2/token`,
    new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/twitter/callback`,
      code_verifier: codeVerifier,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return res.data
}

export async function getTwitterProfile(accessToken: string) {
  const res = await axios.get(`${TWITTER_API}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { 'user.fields': 'id,name,username,profile_image_url' },
  })
  return res.data.data
}

export async function postTweet(params: {
  accessToken: string
  text: string
  mediaIds?: string[]
}): Promise<string> {
  const body: any = { text: params.text }
  if (params.mediaIds?.length) body.media = { media_ids: params.mediaIds }

  const res = await axios.post(`${TWITTER_API}/tweets`, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  return res.data.data.id
}

// ─────────────────────────────────────────────────────────────────────────────
// BLUESKY (AT Protocol — no OAuth needed, uses app passwords)
// ─────────────────────────────────────────────────────────────────────────────

const BLUESKY_API = 'https://bsky.social/xrpc'

export async function authenticateBluesky(handle: string, appPassword: string) {
  const res = await axios.post(`${BLUESKY_API}/com.atproto.server.createSession`, {
    identifier: handle,
    password: appPassword,
  })
  return {
    did: res.data.did,
    handle: res.data.handle,
    accessJwt: res.data.accessJwt,
    refreshJwt: res.data.refreshJwt,
    displayName: res.data.displayName,
  }
}

export async function postToBluesky(params: {
  did: string
  accessJwt: string
  text: string
  imageBlobs?: Array<{ blob: any; alt: string }>
}): Promise<string> {
  const record: any = {
    $type: 'app.bsky.feed.post',
    text: params.text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
  }

  if (params.imageBlobs?.length) {
    record.embed = {
      $type: 'app.bsky.embed.images',
      images: params.imageBlobs.map(img => ({
        image: img.blob,
        alt: img.alt || '',
      })),
    }
  }

  const res = await axios.post(
    `${BLUESKY_API}/com.atproto.repo.createRecord`,
    {
      repo: params.did,
      collection: 'app.bsky.feed.post',
      record,
    },
    { headers: { Authorization: `Bearer ${params.accessJwt}` } }
  )
  return res.data.uri
}

// Upload image to Bluesky's blob store before posting
export async function uploadBlueskyBlob(params: {
  accessJwt: string
  imageBuffer: Buffer
  mimeType: string
}) {
  const res = await axios.post(`${BLUESKY_API}/com.atproto.repo.uploadBlob`, params.imageBuffer, {
    headers: {
      Authorization: `Bearer ${params.accessJwt}`,
      'Content-Type': params.mimeType,
    },
  })
  return res.data.blob
}

// ─────────────────────────────────────────────────────────────────────────────
// PINTEREST
// ─────────────────────────────────────────────────────────────────────────────

const PINTEREST_API = 'https://api.pinterest.com/v5'

export function getPinterestAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.PINTEREST_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/pinterest/callback`,
    response_type: 'code',
    scope: 'pins:read,pins:write,boards:read,boards:write,user_accounts:read',
    state,
  })
  return `https://www.pinterest.com/oauth/?${params}`
}

export async function exchangePinterestCode(code: string) {
  const credentials = Buffer.from(
    `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`
  ).toString('base64')

  const res = await axios.post(
    `${PINTEREST_API}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/pinterest/callback`,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
  return res.data
}

export async function getPinterestBoards(accessToken: string) {
  const res = await axios.get(`${PINTEREST_API}/boards`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { page_size: 100 },
  })
  return res.data.items || []
}

export async function postToPinterest(params: {
  accessToken: string
  boardId: string
  title: string
  description: string
  mediaUrl: string
  link?: string
}): Promise<string> {
  const res = await axios.post(
    `${PINTEREST_API}/pins`,
    {
      board_id: params.boardId,
      title: params.title,
      description: params.description,
      media_source: { source_type: 'image_url', url: params.mediaUrl },
      ...(params.link && { link: params.link }),
    },
    { headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json' } }
  )
  return res.data.id
}

// ─────────────────────────────────────────────────────────────────────────────
// TUMBLR (OAuth 1.0a)
// ─────────────────────────────────────────────────────────────────────────────

const TUMBLR_API = 'https://api.tumblr.com/v2'

export function getTumblrAuthUrl(): string {
  // Tumblr OAuth 1.0a: first get request token, then redirect
  // This is a simplified redirect — real implementation needs the request token flow
  return `https://www.tumblr.com/oauth/authorize`
}

export async function getTumblrBlogs(accessToken: string, accessTokenSecret: string) {
  // Uses OAuth 1.0a signing — handled by tumblr.js client
  const { createClient } = await import('tumblr.js')
  const client = createClient({
    consumer_key: process.env.TUMBLR_CONSUMER_KEY!,
    consumer_secret: process.env.TUMBLR_CONSUMER_SECRET!,
    token: accessToken,
    token_secret: accessTokenSecret,
  })

  return new Promise((resolve, reject) => {
    client.userInfo((err: any, data: any) => {
      if (err) reject(err)
      else resolve(data?.user?.blogs || [])
    })
  })
}

export async function postToTumblr(params: {
  accessToken: string
  accessTokenSecret: string
  blogIdentifier: string // e.g. "myblog.tumblr.com"
  content: string
  tags?: string[]
  mediaUrls?: string[]
}): Promise<string> {
  const { createClient } = await import('tumblr.js')
  const client = createClient({
    consumer_key: process.env.TUMBLR_CONSUMER_KEY!,
    consumer_secret: process.env.TUMBLR_CONSUMER_SECRET!,
    token: params.accessToken,
    token_secret: params.accessTokenSecret,
  })

  // Neue Post Format (NPF)
  const postBody: any = {
    content: [{ type: 'text', text: params.content }],
    state: 'published',
    tags: params.tags?.join(',') || '',
  }

  if (params.mediaUrls?.length) {
    // Prepend image blocks
    const imageBlocks = params.mediaUrls.map(url => ({
      type: 'image',
      media: [{ type: 'image/jpeg', url }],
    }))
    postBody.content = [...imageBlocks, ...postBody.content]
  }

  return new Promise((resolve, reject) => {
    client.createPost(params.blogIdentifier, postBody, (err: any, data: any) => {
      if (err) reject(err)
      else resolve(String(data?.id || data?.id_string || 'ok'))
    })
  })
}
