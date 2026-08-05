'use client'

import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Suspense, useState } from 'react'
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
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const callbackUrl = searchParams.get('callbackUrl') || '/compose'
  const verified = searchParams.get('verified')
  const errorParam = searchParams.get('error')

  // Handle NextAuth error redirects (read at render time, not in effect)
  if (errorParam && !error) {
    if (errorParam === 'CredentialsSignin') {
      setError('Incorrect email or password.')
    } else if (errorParam === 'verification_failed') {
      setError('Email verification failed. Please try again.')
    } else {
      setError('Sign-in failed. Please try again.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email: email.trim(),
      password,
      callbackUrl,
      redirect: false,
    })

    if (result?.error) {
      if (result.error === 'CredentialsSignin') {
        setError('Incorrect email or password.')
      } else if (result.error === 'OAuthCallback') {
        setError('Authentication error. Please try again.')
      } else {
        setError('Sign-in failed. Please try again.')
      }
      setLoading(false)
    } else if (result?.url) {
      window.location.href = result.url
    } else {
      window.location.href = callbackUrl
    }
  }

  return (
    <LoginShell>
      <div style={{ width: 44, height: 44, background: '#7c6eff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', margin: '0 auto 16px' }}>P</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 6px', textAlign: 'center' }}>Welcome back</h1>
      <p style={{ fontSize: 13, color: '#888899', margin: '0 0 28px', textAlign: 'center' }}>Sign in to start publishing everywhere</p>

      {verified && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 13, color: '#166534' }}>
          ✓ Email verified! You can now sign in.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Email</label>
        <input
          type="email"
          placeholder="alex@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{ width: '100%', padding: '10px 12px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', display: 'block', marginBottom: 12 }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#555' }}>Password</label>
          <Link href="/forgot-password" style={{ fontSize: 11, color: '#7c6eff', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ width: '100%', padding: '10px 40px 10px 12px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', display: 'block' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#888' }}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: '#d94040', marginTop: 10 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          style={{
            width: '100%',
            padding: '12px',
            background: '#7c6eff',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            marginTop: 16,
            opacity: loading || !email.trim() || !password ? 0.5 : 1,
            cursor: loading || !email.trim() || !password ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
        <span style={{ fontSize: 12, color: '#aaaabc' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
      </div>

      <p style={{ fontSize: 13, color: '#555', textAlign: 'center', margin: 0 }}>
        Don&apos;t have an account?{' '}
        <Link href="/register" style={{ color: '#7c6eff', textDecoration: 'none', fontWeight: 500 }}>
          Create account
        </Link>
      </p>

      <p style={{ fontSize: 12, color: '#aaaabc', textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
        <Link href="/privacy" style={{ color: '#888899', textDecoration: 'none' }}>
          Privacy Policy
        </Link>
      </p>
    </LoginShell>
  )
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 16, padding: 36, width: '100%', maxWidth: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  )
}
