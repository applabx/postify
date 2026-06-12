'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

// Twitter/X doesn't have multi-account picking like LinkedIn —
// one OAuth flow = one account. This page just confirms what was connected.
export default function TwitterConnectPage() {
  return (
    <Suspense fallback={<div style={s.wrap}>Connecting to X (Twitter)...</div>}>
      <TwitterConnectContent />
    </Suspense>
  )
}

function TwitterConnectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'twitter') {
      setStatus('success')
      setMessage('Your X (Twitter) account has been connected.')
    } else if (error) {
      setStatus('error')
      const msgs: Record<string, string> = {
        twitter_denied: 'Connection was cancelled.',
        twitter_state_mismatch: 'Security check failed. Please try again.',
        twitter_no_verifier: 'OAuth verification failed. Please try again.',
        twitter_failed: 'Connection failed. Check your API credentials.',
      }
      setMessage(msgs[error] || `Error: ${error}`)
    } else {
      // Not a result page — redirect to start OAuth
      window.location.href = '/api/oauth/twitter/start'
    }
  }, [searchParams])

  if (status === 'loading') {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.spinner} />
          <p style={{ color: '#9999aa', textAlign: 'center', marginTop: 16, fontSize: 14 }}>
            Connecting to X (Twitter)...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{ ...s.iconWrap, background: status === 'success' ? 'rgba(62,207,142,0.1)' : 'rgba(255,95,95,0.1)', borderColor: status === 'success' ? 'rgba(62,207,142,0.3)' : 'rgba(255,95,95,0.3)' }}>
          <span style={{ fontSize: 22 }}>{status === 'success' ? '✓' : '✕'}</span>
        </div>

        <h2 style={s.title}>
          {status === 'success' ? 'X (Twitter) Connected' : 'Connection Failed'}
        </h2>
        <p style={s.sub}>{message}</p>

        {status === 'success' && (
          <div style={s.noteBox}>
            <strong style={{ color: '#f0f0f2' }}>Important:</strong> X requires the Basic plan
            ($100/month) for write access. If posting fails, check your API tier at{' '}
            <a href="https://developer.twitter.com" target="_blank" rel="noreferrer" style={{ color: '#7c6eff' }}>
              developer.twitter.com
            </a>.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {status === 'error' && (
            <button
              style={{ ...s.btnPrimary, flex: 1 }}
              onClick={() => { window.location.href = '/api/oauth/twitter/start' }}
            >
              Try again
            </button>
          )}
          <button
            style={{ ...(status === 'success' ? s.btnPrimary : s.btnSecondary), flex: 1 }}
            onClick={() => router.push('/accounts')}
          >
            {status === 'success' ? 'Back to Accounts' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#0f0f11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#17171a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 420, textAlign: 'center' },
  iconWrap: { width: 56, height: 56, borderRadius: '50%', border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', color: 'white' },
  title: { fontSize: 18, fontWeight: 600, color: '#f0f0f2', margin: '0 0 8px' },
  sub: { fontSize: 14, color: '#9999aa', margin: '0 0 16px', lineHeight: 1.6 },
  noteBox: { padding: '12px 14px', background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 9, fontSize: 12, color: '#9999aa', lineHeight: 1.7, textAlign: 'left' },
  btnPrimary: { padding: '10px 20px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9999aa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  spinner: { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(124,110,255,0.2)', borderTopColor: '#7c6eff', margin: '0 auto', animation: 'spin 0.8s linear infinite' },
}
