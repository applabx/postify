import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { consumeOAuthData } from '@/lib/oauth-temp-store'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  if (!key) {
    return NextResponse.json({ error: 'Missing key' }, { status: 400 })
  }

  const data = consumeOAuthData<unknown>(key)
  if (!data) {
    return NextResponse.json({ error: 'Data not found or expired' }, { status: 404 })
  }

  return NextResponse.json(data)
}
