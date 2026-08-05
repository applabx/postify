/**
 * Validates a user-supplied media URL before it is stored and later fetched
 * server-side (Bluesky publishing downloads media URLs on the server).
 * SSRF guard: only public HTTPS URLs are accepted.
 *
 * - scheme must be https
 * - no userinfo (no credentials smuggling)
 * - hostname must not be an IP literal (blocks 127.0.0.1, 169.254.169.254,
 *   ::1, ...) — DNS-rebinding-resistant hostnames are out of scope for an
 *   internal tool; the IP-literal block removes the trivial attack paths.
 * - hostname must not be localhost / a .local / .internal host
 */
const PRIVATE_HOST_RE = /(^|\.)(localhost|local|internal|home|lan)$/i

export function validateMediaUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'mediaUrl is not a valid URL'
  }

  if (url.protocol !== 'https:') {
    return 'mediaUrl must use https'
  }
  if (url.username || url.password) {
    return 'mediaUrl must not contain credentials'
  }
  if (url.hostname.includes(':')) {
    return 'mediaUrl host must not be an IPv6 literal'
  }
  if (/^\d+(\.\d+){3}$/.test(url.hostname)) {
    return 'mediaUrl host must not be an IP address'
  }
  if (PRIVATE_HOST_RE.test(url.hostname)) {
    return 'mediaUrl host must be a public hostname'
  }
  return null
}

export function validateMediaUrls(urls: string[]): string[] | null {
  for (const u of urls) {
    const err = validateMediaUrl(u)
    if (err) return [err, u]
  }
  return null
}
