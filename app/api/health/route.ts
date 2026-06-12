import { NextResponse } from 'next/server'

// GET /api/health — lightweight health check for PM2, Docker, and load balancers
// No auth required. Returns 200 if the server is up.
export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
