import axios from 'axios'

const META_GRAPH = 'https://graph.facebook.com/v19.0'
const META_AUTH = 'https://www.facebook.com/dialog/oauth'

// ─── Step 1: Auth URL ─────────────────────────────────────────────────────────
export function getMetaAuthUrl(state: string, appOrigin?: string): string {
  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_show_list',
    'groups_access_member_info',
    'publish_to_groups',
    'instagram_basic',
    'instagram_content_publish',
    'threads_basic',
    'threads_content_publish',
    'public_profile',
    'email',
  ].join(',')
  const origin = appOrigin || process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${origin}/api/oauth/meta/callback`

  const params = new URLSearchParams({
    client_id: process.env.META_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  })

  return `${META_AUTH}?${params}`
}

// ─── Step 2: Exchange code ────────────────────────────────────────────────────
export async function exchangeMetaCode(code: string): Promise<{
  accessToken: string
  expiresIn: number
}>;
export async function exchangeMetaCode(code: string, appOrigin: string): Promise<{
  accessToken: string
  expiresIn: number
}>;
export async function exchangeMetaCode(code: string, appOrigin?: string): Promise<{
  accessToken: string
  expiresIn: number
}> {
  const origin = appOrigin || process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${origin}/api/oauth/meta/callback`
  const res = await axios.get(`${META_GRAPH}/oauth/access_token`, {
    params: {
      client_id: process.env.META_CLIENT_ID!,
      client_secret: process.env.META_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      code,
    },
  })
  return { accessToken: res.data.access_token, expiresIn: res.data.expires_in }
}

// ─── Step 3: Get long-lived token (60 days vs 1 hour) ────────────────────────
export async function getLongLivedToken(shortToken: string): Promise<string> {
  const res = await axios.get(`${META_GRAPH}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_CLIENT_ID!,
      client_secret: process.env.META_CLIENT_SECRET!,
      fb_exchange_token: shortToken,
    },
  })
  return res.data.access_token
}

// ─── Step 4: Get all Pages this user manages ─────────────────────────────────
export async function getFacebookPages(userToken: string): Promise<FacebookPage[]> {
  const res = await axios.get(`${META_GRAPH}/me/accounts`, {
    params: {
      access_token: userToken,
      fields: 'id,name,category,picture,access_token,instagram_business_account',
    },
  })

  const pages = (res.data.data || []) as Array<{
    id: string
    name: string
    category: string
    picture?: { data?: { url?: string } }
    access_token: string
    instagram_business_account?: { id?: string }
  }>

  return pages.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    pictureUrl: p.picture?.data?.url,
    pageAccessToken: p.access_token, // Page-level token — use this for posting
    instagramAccountId: p.instagram_business_account?.id,
  }))
}

// ─── Step 5: Get all Groups this user manages ────────────────────────────────
export async function getFacebookGroups(userToken: string): Promise<FacebookGroup[]> {
  const res = await axios.get(`${META_GRAPH}/me/groups`, {
    params: {
      access_token: userToken,
      fields: 'id,name,privacy,picture',
      admin_only: true, // Only groups where user is admin
    },
  })

  const groups = (res.data.data || []) as Array<{
    id: string
    name: string
    privacy: string
    picture?: { data?: { url?: string } }
  }>

  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    privacy: g.privacy,
    pictureUrl: g.picture?.data?.url,
  }))
}

// ─── Step 6: Get Instagram account linked to a Facebook Page ─────────────────
export async function getInstagramAccount(pageId: string, pageToken: string) {
  const res = await axios.get(`${META_GRAPH}/${pageId}`, {
    params: {
      access_token: pageToken,
      fields: 'instagram_business_account{id,name,username,profile_picture_url}',
    },
  })
  return res.data.instagram_business_account || null
}

// ─── Step 7: Get Threads profile ─────────────────────────────────────────────
export async function getThreadsProfile(accessToken: string) {
  const res = await axios.get(`https://graph.threads.net/v1.0/me`, {
    params: { access_token: accessToken, fields: 'id,name,username,threads_profile_picture_url' },
  })
  return res.data
}

// ──────────────────────────────────────────────────────────────────────────────
// POST FUNCTIONS
// ──────────────────────────────────────────────────────────────────────────────

// Post to Facebook Page
export async function postToFacebookPage(params: {
  pageId: string
  pageAccessToken: string
  message: string
  mediaUrls?: string[]
}): Promise<string> {
  if (params.mediaUrls?.length === 1) {
    // Single photo post
    const res = await axios.post(`${META_GRAPH}/${params.pageId}/photos`, {
      url: params.mediaUrls[0],
      caption: params.message,
      access_token: params.pageAccessToken,
    })
    return res.data.id
  } else if (params.mediaUrls && params.mediaUrls.length > 1) {
    // Multi-photo: stage each then post as batch
    const photoIds = await Promise.all(
      params.mediaUrls.map(url =>
        axios.post(`${META_GRAPH}/${params.pageId}/photos`, {
          url,
          published: false,
          access_token: params.pageAccessToken,
        }).then(r => ({ media_fbid: r.data.id }))
      )
    )
    const res = await axios.post(`${META_GRAPH}/${params.pageId}/feed`, {
      message: params.message,
      attached_media: photoIds,
      access_token: params.pageAccessToken,
    })
    return res.data.id
  } else {
    // Text-only post
    const res = await axios.post(`${META_GRAPH}/${params.pageId}/feed`, {
      message: params.message,
      access_token: params.pageAccessToken,
    })
    return res.data.id
  }
}

// Post to Facebook Group
export async function postToFacebookGroup(params: {
  groupId: string
  userAccessToken: string
  message: string
}): Promise<string> {
  const res = await axios.post(`${META_GRAPH}/${params.groupId}/feed`, {
    message: params.message,
    access_token: params.userAccessToken,
  })
  return res.data.id
}

// Post to Instagram (requires media — IG doesn't allow text-only)
export async function postToInstagram(params: {
  igAccountId: string
  pageAccessToken: string
  caption: string
  mediaUrl: string
  mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  mediaUrls?: string[]
}): Promise<string> {
  if (params.mediaType === 'CAROUSEL' && params.mediaUrls && params.mediaUrls.length > 1) {
    // Step 1: Create child media containers
    const childIds = await Promise.all(
      params.mediaUrls.map(url =>
        axios.post(`${META_GRAPH}/${params.igAccountId}/media`, {
          image_url: url,
          is_carousel_item: true,
          access_token: params.pageAccessToken,
        }).then(r => r.data.id)
      )
    )

    // Step 2: Create carousel container
    const containerRes = await axios.post(`${META_GRAPH}/${params.igAccountId}/media`, {
      media_type: 'CAROUSEL',
      children: childIds,
      caption: params.caption,
      access_token: params.pageAccessToken,
    })
    const containerId = containerRes.data.id

    // Step 3: Publish
    const publishRes = await axios.post(`${META_GRAPH}/${params.igAccountId}/media_publish`, {
      creation_id: containerId,
      access_token: params.pageAccessToken,
    })
    return publishRes.data.id
  }

  // Step 1: Create media container (IMAGE or VIDEO)
  const mediaBody: Record<string, unknown> = {
    caption: params.caption,
    access_token: params.pageAccessToken,
  }
  if (params.mediaType === 'VIDEO') {
    mediaBody.media_type = 'VIDEO'
    mediaBody.video_url = params.mediaUrl
  } else {
    mediaBody.image_url = params.mediaUrl
  }

  const containerRes = await axios.post(`${META_GRAPH}/${params.igAccountId}/media`, mediaBody)
  const containerId = containerRes.data.id

  // Step 2: Publish container
  const publishRes = await axios.post(`${META_GRAPH}/${params.igAccountId}/media_publish`, {
    creation_id: containerId,
    access_token: params.pageAccessToken,
  })
  return publishRes.data.id
}

// Post to Threads
export async function postToThreads(params: {
  threadsUserId: string
  accessToken: string
  text: string
  mediaUrl?: string
}): Promise<string> {
  const base = 'https://graph.threads.net/v1.0'

  // Step 1: Create container
  const containerRes = await axios.post(`${base}/${params.threadsUserId}/threads`, {
    media_type: params.mediaUrl ? 'IMAGE' : 'TEXT',
    text: params.text,
    ...(params.mediaUrl && { image_url: params.mediaUrl }),
    access_token: params.accessToken,
  })

  // Step 2: Publish
  const publishRes = await axios.post(`${base}/${params.threadsUserId}/threads_publish`, {
    creation_id: containerRes.data.id,
    access_token: params.accessToken,
  })
  return publishRes.data.id
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FacebookPage {
  id: string
  name: string
  category: string
  pictureUrl?: string
  pageAccessToken: string
  instagramAccountId?: string
}

export interface FacebookGroup {
  id: string
  name: string
  privacy: string
  pictureUrl?: string
}
