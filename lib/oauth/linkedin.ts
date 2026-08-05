import { http } from './http'

const LINKEDIN_API = 'https://api.linkedin.com/v2'
const LINKEDIN_AUTH = 'https://www.linkedin.com/oauth/v2'

// ─── Step 1: Generate the OAuth URL the user clicks ─────────────────────────
export function getLinkedInAuthUrl(state: string, appOrigin?: string): string {
  // NOTE: scope set verified against LinkedIn itself (2026-08-05, direct
  // authorization-endpoint probes with client_id 86q9m9ka37vvqo) AND the
  // LinkedIn Developer Console:
  //   openid profile email                      -> LinkedIn "Authorize" page (OK)
  //   + w_member_social                         -> LinkedIn "Authorize" page (OK)
  //   + r_organization_admin                    -> unauthorized_scope_error
  //   + w_organization_social                   -> unauthorized_scope_error
  //   + offline_access                          -> invalid_scope_error
  // The production LinkedIn app is authorized ONLY for the Sign In with
  // LinkedIn using OpenID Connect product (openid profile email) and
  // Share on LinkedIn (w_member_social). Requesting any other scope makes
  // LinkedIn reject the ENTIRE request ("Bummer, something went wrong").
  // Re-add org scopes ONLY after LinkedIn app review grants them and the
  // probe returns the Authorize page without an error.
  const scopes = [
    'openid',
    'profile',
    'email',
    'w_member_social',
  ].join(' ')
  const origin = appOrigin || process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${origin}/api/oauth/linkedin/callback`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri,
    state,
    scope: scopes,
  })

  return `${LINKEDIN_AUTH}/authorization?${params}`
}

// ─── Step 2: Exchange code for tokens ────────────────────────────────────────
export async function exchangeLinkedInCode(code: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
}>;
export async function exchangeLinkedInCode(code: string, appOrigin: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
}>;
export async function exchangeLinkedInCode(code: string, appOrigin?: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
}> {
  const origin = appOrigin || process.env.NEXT_PUBLIC_APP_URL!
  const redirectUri = `${origin}/api/oauth/linkedin/callback`
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
  })

  const res = await http.post(`${LINKEDIN_AUTH}/accessToken`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  return {
    accessToken: res.data.access_token,
    refreshToken: res.data.refresh_token,
    expiresIn: res.data.expires_in,
  }
}

// ─── Step 3: Get the user's own profile (for linking to our User) ─────────────
export async function getLinkedInProfile(accessToken: string): Promise<{
  id: string
  name: string
  email: string
  picture?: string
}> {
  const res = await http.get(`${LINKEDIN_API}/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  return {
    id: res.data.sub,
    name: res.data.name,
    email: res.data.email,
    picture: res.data.picture,
  }
}

// ─── Step 4: Get ALL Pages/Organizations this user admins ────────────────────
// This is the key call — returns whatever pages they manage, not hardcoded ones
export async function getLinkedInAdminPages(accessToken: string): Promise<LinkedInPage[]> {
  // Fetch all organizations where this person has ADMINISTRATOR role
  const res = await http.get(`${LINKEDIN_API}/organizationAcls`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202304',
    },
    params: {
      q: 'roleAssignee',
      role: 'ADMINISTRATOR',
      projection: '(elements*(organization~(id,name,vanityName,logoV2(original~:playbackUrl))))',
      count: 50,
    },
  })

  const elements = (res.data.elements || []) as Array<{
    'organization~'?: {
      id?: string | number
      name?: { localized?: { en_US?: string } } | string
      vanityName?: string
      logoV2?: { 'original~'?: { elements?: Array<{ identifiers?: Array<{ identifier?: string }> }> } }
    }
  }>

  const pages: LinkedInPage[] = elements.map((el) => {
    const org = el['organization~']
    return {
      id: String(org?.id || ''),
      urn: `urn:li:organization:${org?.id}`,
      name: (typeof org?.name === 'string' ? org.name : org?.name?.localized?.en_US) || 'Unnamed Page',
      vanityName: org?.vanityName,
      logoUrl: org?.logoV2?.['original~']?.elements?.[0]?.identifiers?.[0]?.identifier,
    }
  })

  return pages
}

// ─── Post to a LinkedIn Page ─────────────────────────────────────────────────
export async function postToLinkedIn(params: {
  accessToken: string
  organizationUrn: string  // e.g. "urn:li:organization:12345678"
  text: string
  mediaAssets?: string[]   // LinkedIn asset URNs after media upload
}): Promise<string> {
  const body: {
    author: string
    lifecycleState: 'PUBLISHED'
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: string }
        shareMediaCategory: 'IMAGE' | 'NONE'
        media?: Array<{ status: 'READY'; media: string }>
      }
    }
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  } = {
    author: params.organizationUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: params.text },
        shareMediaCategory: params.mediaAssets?.length ? 'IMAGE' : 'NONE',
        ...(params.mediaAssets?.length && {
          media: params.mediaAssets.map(asset => ({
            status: 'READY',
            media: asset,
          })),
        }),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }

  const res = await http.post(`${LINKEDIN_API}/ugcPosts`, body, {
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  })

  // Returns the URN of the created post
  return res.headers['x-restli-id'] || res.data.id
}

export interface LinkedInPage {
  id: string
  urn: string
  name: string
  vanityName?: string
  logoUrl?: string
}
