import { NextRequest, NextResponse } from 'next/server'
import { refreshExpiringTokens } from '@/lib/token-refresh'

// GET /api/cron/refresh-tokens
// Secure this endpoint with a secret key in production
// Add to your crontab: 0 3 * * * curl https://yourdomain.com/api/cron/refresh-tokens?secret=YOUR_SECRET
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get('secret')

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await refreshExpiringTokens()
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('[Cron] Token refresh failed:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
