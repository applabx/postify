import { NextResponse } from 'next/server'
import { renderMetrics } from '@/lib/metrics'

// GET /api/metrics — Prometheus scrape endpoint.
// Public (like /api/health): exposes counts and gauges only, no PII or
// secrets. Protected by design from leaking tokens: no per-user labels.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const body = await renderMetrics()
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[Metrics] render failed:', err)
    return NextResponse.json({ error: 'metrics unavailable' }, { status: 500 })
  }
}
