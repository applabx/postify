'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthShell><p>Loading...</p></AuthShell>}>
      <RegisterContent />
    </Suspense>
  )
}

function RegisterContent() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/compose'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Fetch CSRF token first (sets httpOnly cookie)
      const csrfRes = await fetch('/api/auth/register/start')
      if (!csrfRes.ok) throw new Error('Failed to initialise request')
      const { csrfToken } = await csrfRes.json()

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken, email, password, name }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      setSuccess(true)
      // Auto sign-in after registration
      const signInResult = await signIn('credentials', {
        email,
        password,
        callbackUrl,
        redirect: false,
      })
      if (signInResult?.error) {
        // Registration succeeded but sign-in failed (e.g. email not verified)
        setLoading(false)
      } else if (signInResult?.url) {
        window.location.href = signInResult.url
      } else {
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthShell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Check your email</h2>
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>
            We sent a verification link to <strong>{email}</strong>.<br />
            Click it to activate your account and sign in.
          </p>
          <p style={{ fontSize: 12, color: '#aaa' }}>
            Didn&apos;t get the email?{' '}
            <button
              onClick={() => setSuccess(false)}
              style={{ background: 'none', border: 'none', color: '#7c6eff', cursor: 'pointer', fontSize: 12, padding: 0 }}
            >
              Try again
            </button>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div style={{ width: 44, height: 44, background: '#7c6eff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', margin: '0 auto 16px' }}>P</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 6px', textAlign: 'center' }}>Create your account</h1>
      <p style={{ fontSize: 13, color: '#888899', margin: '0 0 28px', textAlign: 'center' }}>Start publishing everywhere in minutes</p>

      <form onSubmit={handleSubmit}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Full name</label>
        <input
          type="text"
          placeholder="Alex Johnson"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          minLength={2}
          style={inputStyle}
        />

        <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 }}>Email</label>
        <input
          type="email"
          placeholder="alex@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={inputStyle}
        />

        <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 }}>Password</label>
        <input
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />

        {error && <p style={{ fontSize: 12, color: '#d94040', marginTop: 10 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim() || !email.trim() || password.length < 8}
          style={{
            ...btnStyle,
            opacity: loading || !name.trim() || !email.trim() || password.length < 8 ? 0.5 : 1,
            cursor: loading || !name.trim() || !email.trim() || password.length < 8 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
        <span style={{ fontSize: 12, color: '#aaaabc' }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
      </div>

      <p style={{ fontSize: 13, color: '#555', textAlign: 'center', margin: 0 }}>
        Already have an account?{' '}
        <a href="/login" style={{ color: '#7c6eff', textDecoration: 'none', fontWeight: 500 }}>Sign in</a>
      </p>
    </AuthShell>
  )
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 16, padding: 36, width: '100%', maxWidth: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#f0f0f5',
  border: '1px solid rgba(0,0,0,0.10)',
  borderRadius: 8,
  color: '#1a1a2e',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  display: 'block',
}

const btnStyle: React.CSSProperties = {
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
  transition: 'opacity 0.15s',
}
