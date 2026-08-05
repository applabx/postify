import dns from 'node:dns/promises'

/**
 * Validates a user-supplied media URL before it is stored and later fetched
 * server-side (Bluesky publishing downloads media URLs on the server).
 *
 * Layer 1 (synchronous, accept time): https-only, no credentials, no IP
 * literals, no localhost/.local/.internal hostnames.
 *
 * Layer 2 (DNS, accept time and before publish): resolve the hostname and
 * reject any A/AAAA record in private/reserved ranges.
 *
 * Residual risk (documented): DNS rebinding between validation and the
 * platform-side fetch cannot be fully eliminated for the Bluesky download
 * path without pinning resolved IPs. The validated hostname must be a public
 * HTTPS URL at accept time, which requires an attacker to control DNS and
 * time a rebinding attack against a fetch that completes in seconds. This is
 * accepted for an internal tool; the IP-literal and private-range checks
 * remove all trivial attack paths.
 */

const PRIVATE_HOST_RE = /(^|\.)(localhost|local|internal|home|lan)$/i

function ipv4IsPrivate(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number)
  if (a === 0) return true                        // 0.0.0.0/8
  if (a === 10) return true                       // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 127) return true                      // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true         // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true         // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15
  if (a >= 224) return true                       // multicast + reserved
  return false
}

function ipv6IsPrivate(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped — validate the embedded IPv4
    const v4 = lower.split(':').pop()!
    return ipv4IsPrivate(v4)
  }
  if (lower.startsWith('64:ff9b:')) return true   // NAT64 well-known prefix
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true // fc00::/7 ULA
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true // fe80::/10 link-local
  if (lower.startsWith('ff')) return true          // multicast
  if (lower.startsWith('2001:db8:')) return true   // documentation range
  return false
}

export function ipIsPrivate(ip: string): boolean {
  const family = ip.includes(':') ? 6 : 4
  return family === 6 ? ipv6IsPrivate(ip) : ipv4IsPrivate(ip)
}

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

/**
 * DNS-level validation: resolves the hostname and rejects private/reserved
 * address ranges (SSRF defense against hostnames that point at internal
 * services). Returns null when the hostname is public.
 */
export async function validateMediaUrlDns(raw: string): Promise<string | null> {
  const err = validateMediaUrl(raw)
  if (err) return err
  const hostname = new URL(raw).hostname
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true })
    if (records.length === 0) return `mediaUrl host ${hostname} did not resolve`
    for (const r of records) {
      if (ipIsPrivate(r.address)) {
        return `mediaUrl host ${hostname} resolves to a private/reserved address (${r.address})`
      }
    }
    return null
  } catch (e) {
    return `mediaUrl host ${hostname} failed to resolve: ${(e as Error).message}`
  }
}

export async function validateMediaUrlsDns(urls: string[]): Promise<string[] | null> {
  for (const u of urls) {
    const err = await validateMediaUrlDns(u)
    if (err) return [err, u]
  }
  return null
}
