import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const PREFIX = 'enc:v1'

function getKey(): Buffer | null {
  const secret = process.env.TOKEN_ENCRYPTION_KEY
  if (!secret) return null
  return createHash('sha256').update(secret).digest()
}

export function encryptSecret(value: string): string {
  const key = getKey()
  if (!key || !value) return value

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${PREFIX}:${iv.toString('base64url')}:${encrypted.toString('base64url')}:${tag.toString('base64url')}`
}

export function decryptSecret(value: string): string {
  const key = getKey()
  if (!key || !value || !value.startsWith(`${PREFIX}:`)) return value

  const [, , ivB64, encryptedB64, tagB64] = value.split(':')
  if (!ivB64 || !encryptedB64 || !tagB64) return value

  const iv = Buffer.from(ivB64, 'base64url')
  const encrypted = Buffer.from(encryptedB64, 'base64url')
  const tag = Buffer.from(tagB64, 'base64url')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
