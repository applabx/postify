'use client'

import { getProviders, signIn } from 'next-auth/react'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginContent />
    </Suspense>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasGoogle, setHasGoogle] = useState(false)
  const [hasDevAuth, setHasDevAuth] = useState(false)
  const hasAnyAuth = hasGoogle || hasDevAuth

  const callbackUrl = searchParams.get('callbackUrl') || '/compose'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const providers = await getProviders()
        if (cancelled) return
        setHasGoogle(!!providers?.google)
        setHasDevAuth(!!providers?.credentials)
      } catch {
        if (cancelled) return
        setHasGoogle(false)
        setHasDevAuth(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleGoogle = async () => {
    setLoading(true)
    await signIn('google', { callbackUrl })
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const result = await signIn('credentials', {
      email,
      password: 'dev',
      callbackUrl,
      redirect: false,
    })
    if (result?.error) {
      if (result.error === 'CredentialsSignin') {
        setError('Sign-in was rejected by server. Check container logs and auth env settings.')
      } else {
        setError('Sign in failed. Please try again.')
      }
      setLoading(false)
    } else {
      window.location.href = callbackUrl
    }
  }

  return <LoginShell hasGoogle={hasGoogle} hasDevAuth={hasDevAuth} hasAnyAuth={hasAnyAuth} loading={loading} error={error} email={email} setEmail={setEmail} onGoogle={handleGoogle} onEmail={handleEmail} />
}

function LoginShell({
  hasGoogle = false,
  hasDevAuth = false,
  hasAnyAuth = false,
  loading = false,
  error = '',
  email = '',
  setEmail = () => {},
  onGoogle = () => {},
  onEmail = (e: React.FormEvent) => e.preventDefault(),
}: {
  hasGoogle?: boolean
  hasDevAuth?: boolean
  hasAnyAuth?: boolean
  loading?: boolean
  error?: string
  email?: string
  setEmail?: (value: string) => void
  onGoogle?: () => void
  onEmail?: (e: React.FormEvent) => void
}) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 16, padding: 36, width: '100%', maxWidth: 380, textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 44, height: 44, background: '#7c6eff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', margin: '0 auto 16px' }}>P</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 6px' }}>Postify</h1>
        <p style={{ fontSize: 13, color: '#888899', margin: '0 0 28px' }}>Sign in to start publishing everywhere</p>

        {/* Google button — only shown when Google OAuth is configured */}
        {hasGoogle && (
          <>
            <button
              onClick={onGoogle}
              disabled={loading}
              style={{ width: '100%', padding: '11px 16px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 9, color: '#1a1a2e', fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: loading ? 0.6 : 1, marginBottom: 16 }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.67 3.67 0 01-1.59 2.41v2h2.57c1.5-1.38 2.4-3.42 2.4-5.87z" fill="#4285F4"/>
                <path d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.57-2a4.8 4.8 0 01-7.17-2.52H.98v2.06A8 8 0 008 16z" fill="#34A853"/>
                <path d="M3.55 9.54A4.83 4.83 0 013.3 8c0-.54.09-1.06.25-1.54V4.4H.98A8 8 0 000 8c0 1.29.31 2.51.98 3.6l2.57-2.06z" fill="#FBBC05"/>
                <path d="M8 3.18c1.22 0 2.31.42 3.17 1.24l2.37-2.37A8 8 0 00.98 4.4l2.57 2.06A4.77 4.77 0 018 3.18z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              <span style={{ fontSize: 12, color: '#aaaabc' }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
            </div>
          </>
        )}

        {hasDevAuth && (
          <form onSubmit={onEmail}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{ width: '100%', padding: '11px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading || !email.trim() ? 0.5 : 1 }}
            >
              {loading ? 'Signing in...' : 'Continue with Email'}
            </button>
          </form>
        )}

        {!hasAnyAuth && (
          <p style={{ fontSize: 12, color: '#d94040', marginTop: 12 }}>
            No sign-in method is enabled. Configure Google OAuth or enable dev auth.
          </p>
        )}

        {error && <p style={{ fontSize: 12, color: '#d94040', marginTop: 12 }}>{error}</p>}

        {hasDevAuth && (
          <p style={{ fontSize: 11, color: '#aaaabc', marginTop: 16 }}>
            Local dev login: use any email address.
          </p>
        )}
      </div>
    </div>
  )
}
