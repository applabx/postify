'use client'

// Sentry React integration (client side). No-op unless
// NEXT_PUBLIC_SENTRY_DSN is set. Captures React render errors via the
// ErrorBoundary in the root layout.
import { useEffect } from 'react'

export function initSentryClient(): void {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
    if (!dsn) return
    import('@sentry/react')
      .then((Sentry) => {
        Sentry.init({
          dsn,
          environment: process.env.NODE_ENV || 'production',
          release: process.env.NEXT_PUBLIC_SOURCE_COMMIT || undefined,
          tracesSampleRate: 0.05,
          beforeSend: (event) => {
            if (event.request?.headers) {
              delete event.request.headers['authorization']
              delete event.request.headers['cookie']
            }
            return event
          },
        })
      })
      .catch(() => {
        // never break the app for telemetry
      })
  }, [])
}

export { ErrorBoundary } from '@sentry/react'
