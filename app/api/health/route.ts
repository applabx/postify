import { NextResponse } from 'next/server'

// GET /api/health — lightweight health check for PM2, Docker, and load balancers
// No auth required. Returns 200 if the server is up.
// `commit` reflects SOURCE_COMMIT as injected by the deployment platform
// (Coolify sets it to the git SHA at deploy time). Operators can use it to
// verify the running container matches the intended release.
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commit: process.env.SOURCE_COMMIT || null,
  })
}
