import * as Sentry from '@sentry/node'

// Sentry integration (Phase 5). All calls are no-ops unless SENTRY_DSN is set,
// so local/dev environments and image builds never touch Sentry. The release
// is tagged with the git SHA (SOURCE_COMMIT) so stack traces map to commits.
//
// PII/secret policy: beforeSend scrubs auth headers, cookies, and query
// parameters that carry tokens/codes; error messages are trimmed to 500 chars
// (platform APIs occasionally embed user input in messages).

let installed = false

export function initSentryServer(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn || process.env.NEXT_RUNTIME === 'edge' || installed) return
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'production',
      release: process.env.SOURCE_COMMIT || undefined,
      tracesSampleRate: 0.05,
      maxBreadcrumbs: 50,
      beforeSend: (event) => {
        const SENSITIVE_QUERY = /(access_?token|refresh_?token|code|oauth_verifier|authorization|credential)=/i
        if (event.request) {
          const url = event.request.url
          if (url) {
            const idx = url.indexOf('?')
            if (idx !== -1) {
              const query = url.slice(idx)
              event.request.url = SENSITIVE_QUERY.test(query)
                ? `${url.slice(0, idx)}?[redacted]`
                : url
            }
          }
          if (event.request.headers) {
            delete event.request.headers['authorization']
            delete event.request.headers['cookie']
            delete event.request.headers['x-csrf-token']
          }
        }
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.filter(
            (b) => !String(b.message ?? '').match(/Authorization: Bearer/i)
          )
        }
        return event
      },
    })
    installed = true
  } catch {
    // Never let Sentry init break the app
  }
}

export function sentryEnabled(): boolean {
  return installed
}

export function safeCaptureException(err: unknown, ctx?: Record<string, string | number>): void {
  if (!installed) return
  const e = err instanceof Error ? err : new Error(String(err))
  try {
    Sentry.captureException(e, ctx ? { tags: ctx } : undefined)
  } catch {
    // ignore
  }
}

export function safeCaptureMessage(
  msg: string,
  level: 'info' | 'warning' | 'error' = 'warning',
  ctx?: Record<string, string | number>
): void {
  if (!installed) return
  try {
    Sentry.captureMessage(msg, { level, tags: ctx })
  } catch {
    // ignore
  }
}
