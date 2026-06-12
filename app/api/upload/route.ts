import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createHash } from 'crypto'
import { rateLimit, rateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/upload
// Client sends file as FormData, server signs and proxies to Cloudinary
// This keeps Cloudinary API secret off the client
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit: 20 uploads per minute
  const rl = rateLimit(rateLimitKey(session.user.id, 'upload'), RATE_LIMITS.upload)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Upload limit reached. Please wait.' }, { status: 429 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  // Validate file type
  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/mov', 'video/quicktime']
  if (!validTypes.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }

  // Validate size (512MB max)
  const MAX_SIZE = 512 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 512MB)' }, { status: 400 })
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!
  const apiKey = process.env.CLOUDINARY_API_KEY!
  const apiSecret = process.env.CLOUDINARY_API_SECRET!

  // Build signed upload params
  const timestamp = Math.floor(Date.now() / 1000)
  const folder = `postify/${(session.user as any).id}`
  const resourceType = file.type.startsWith('video/') ? 'video' : 'image'

  // Params to sign (must be sorted alphabetically)
  const paramsToSign: Record<string, string | number> = {
    folder,
    timestamp,
    // Transformations: generate multiple sizes for different platforms
    eager: [
      'c_fill,w_1200,h_630',  // Facebook/LinkedIn OG
      'c_fill,w_1080,h_1080', // Instagram square
      'c_fill,w_1080,h_1920', // Stories
    ].join('|'),
  }

  const signatureString = Object.entries(paramsToSign)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&') + apiSecret

  const signature = createHash('sha256').update(signatureString).digest('hex')

  // Build FormData for Cloudinary
  const cloudinaryForm = new FormData()
  cloudinaryForm.append('file', file)
  cloudinaryForm.append('api_key', apiKey)
  cloudinaryForm.append('timestamp', String(timestamp))
  cloudinaryForm.append('signature', signature)
  cloudinaryForm.append('folder', folder)
  cloudinaryForm.append('eager', paramsToSign.eager as string)

  try {
    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
      { method: 'POST', body: cloudinaryForm }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.json()
      console.error('Cloudinary error:', err)
      return NextResponse.json({ error: 'Upload failed', detail: err.error?.message }, { status: 500 })
    }

    const result = await uploadRes.json()

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      resourceType: result.resource_type,
      // Pre-generated sizes
      variants: {
        og: result.eager?.[0]?.secure_url,         // 1200×630
        square: result.eager?.[1]?.secure_url,      // 1080×1080
        story: result.eager?.[2]?.secure_url,       // 1080×1920
      },
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
