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
