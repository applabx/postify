/**
 * lib/redirect-url.ts
 *
 * Builds absolute redirect URLs from NEXT_PUBLIC_APP_URL.
 *
 * Why: the Next.js standalone server constructs `req.url` from the container's
 * HOSTNAME/PORT env vars (the Dockerfile sets HOSTNAME=0.0.0.0, PORT=3000),
 * IGNORING the Host header sent by Traefik. Any `new URL(path, req.url)`
 * therefore produced `http://0.0.0.0:3000/...` in production, which browsers
 * refuse to connect to. All OAuth/redirect construction must use the public
 * app URL instead.
 */
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export function redirectTo(path: string): string {
  return new URL(path, appUrl()).toString()
}
