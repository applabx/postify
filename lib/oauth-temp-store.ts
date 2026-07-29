import { randomBytes } from 'crypto'

const store = new Map<string, { data: unknown; expiresAt: number }>()

const TTL_MS = 5 * 60 * 1000

export function storeOAuthData(data: unknown): string {
  const key = randomBytes(24).toString('hex')
  store.set(key, { data, expiresAt: Date.now() + TTL_MS })
  if (store.size > 1000) prune()
  return key
}

export function peekOAuthData<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data as T
}

export function consumeOAuthData<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  store.delete(key)
  return entry.data as T
}

function prune() {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key)
  }
}
