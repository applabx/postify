'use client'

// Wraps the app in the Sentry error boundary (no-op without DSN).
import { ErrorBoundary, initSentryClient } from './sentry-client'
import Providers from './providers'

export default function AppProviders({ children }: { children: React.ReactNode }) {
  initSentryClient()
  return (
    <ErrorBoundary
      fallback={({ error }) => (
        <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#444' }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
          <p>
            An unexpected error occurred. The issue has been recorded — please reload the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              background: '#7c6eff',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', color: '#888' }}>Error details</summary>
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{String(error)}</pre>
          </details>
        </div>
      )}
    >
      <Providers>{children}</Providers>
    </ErrorBoundary>
  )
}
