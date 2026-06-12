'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html>
      <body style={{ margin: 0, background: '#f5f5f8', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 40, maxWidth: 400 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(217,64,64,0.08)', border: '1px solid rgba(217,64,64,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22, color: '#d94040' }}>!</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', margin: '0 0 8px' }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: '#777790', margin: '0 0 24px', lineHeight: 1.6 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={reset}
              style={{ padding: '9px 18px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Try again
            </button>
            <a
              href="/compose"
              style={{ padding: '9px 18px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, color: '#555570', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
