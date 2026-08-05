/**
 * Validates required environment variables at app startup.
 * Import this in any API route that needs a specific platform — it will
 * throw early with a clear message instead of failing mid-request.
 */

const REQUIRED_FOR_ALL = [
  'DATABASE_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'CRON_SECRET',
  // Used as the base for every OAuth redirect URL. If missing or wrong
  // (e.g. an internal 0.0.0.0 value), browsers cannot follow the redirects.
  'NEXT_PUBLIC_APP_URL',
]

const PLATFORM_REQUIRED: Record<string, string[]> = {
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  meta: ['META_CLIENT_ID', 'META_CLIENT_SECRET'],
  twitter: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'],
  pinterest: ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'],
  tumblr: ['TUMBLR_CONSUMER_KEY', 'TUMBLR_CONSUMER_SECRET'],
  cloudinary: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
  redis: ['REDIS_URL'],
}

export function validateEnv(platforms: (keyof typeof PLATFORM_REQUIRED)[] = []) {
  const missing: string[] = []

  for (const key of REQUIRED_FOR_ALL) {
    if (!process.env[key]) missing.push(key)
  }

  for (const platform of platforms) {
    for (const key of PLATFORM_REQUIRED[platform] || []) {
      if (!process.env[key]) missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}\n\nSee .env.example for setup instructions.`
    )
  }

  // The public app URL is the base for EVERY OAuth redirect. A wrong value
  // (e.g. an internal host leaked from the container environment) silently
  // breaks every redirect — production served https://0.0.0.0:3000/... for
  // weeks because of exactly this. Fail fast instead of shipping broken URLs.
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      const parsed = new URL(process.env.NEXT_PUBLIC_APP_URL)
      const host = parsed.hostname
      if (host === '0.0.0.0' || host === 'localhost' || host === '127.0.0.1') {
        throw new Error(
          `NEXT_PUBLIC_APP_URL must be the public HTTPS URL, got "${process.env.NEXT_PUBLIC_APP_URL}" (internal host "${host}" would break all OAuth redirects).`
        )
      }
      if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
        throw new Error(
          `NEXT_PUBLIC_APP_URL must use https in production, got "${process.env.NEXT_PUBLIC_APP_URL}".`
        )
      }
    } catch (err: any) {
      if (err?.message?.startsWith('NEXT_PUBLIC_APP_URL')) throw err
      throw new Error(`NEXT_PUBLIC_APP_URL is not a valid URL: "${process.env.NEXT_PUBLIC_APP_URL}"`)
    }
  }
}

// Check core env vars at module load time (runs once on server start)
if (typeof window === 'undefined') {
  try {
    validateEnv()
  } catch (err: any) {
    // Don't crash during build — only crash at runtime
    if (process.env.NODE_ENV === 'production') {
      console.error('[Postify] STARTUP ERROR:', err.message)
      process.exit(1)
    } else {
      console.warn('[Postify] WARNING:', err.message)
    }
  }
}
