'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import Link from 'next/link'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Shell><p>Loading...</p></Shell>}>
      <ResetContent />
    </Suspense>
  )
}

function ResetContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Reset failed')
        setLoading(false)
        return
      }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Invalid reset link</h2>
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>
            This reset link is invalid or has expired.<br />
            Please request a new one.
          </p>
          <Link href="/forgot-password" style={{ color: '#7c6eff', textDecoration: 'none', fontWeight: 500, fontSize: 13 }}>
            Request new reset link
          </Link>
        </div>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>Password reset!</h2>
          <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>
            Your password has been updated.<br />
            You can now sign in with your new password.
          </p>
          <Link href="/login" style={{ background: '#7c6eff', color: 'white', padding: '11px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 500, fontSize: 14, display: 'inline-block' }}>
            Sign in
          </Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ width: 44, height: 44, background: '#7c6eff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', margin: '0 auto 16px' }}>P</div>
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 6px', textAlign: 'center' }}>New password</h1>
      <p style={{ fontSize: 13, color: '#888899', margin: '0 0 28px', textAlign: 'center' }}>Create a strong password for your account</p>

      <form onSubmit={handleSubmit}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>New password</label>
        <input
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={8}
          style={{ width: '100%', padding: '10px 12px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', display: 'block' }}
        />
        <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4, marginTop: 12 }}>Confirm password</label>
        <input
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          minLength={8}
          style={{ width: '100%', padding: '10px 12px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', display: 'block' }}
        />
        {error && <p style={{ fontSize: 12, color: '#d94040', marginTop: 10 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || password.length < 8 || password !== confirm}
          style={{ width: '100%', padding: '12px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', marginTop: 16, opacity: loading || password.length < 8 || password !== confirm ? 0.5 : 1, cursor: loading || password.length < 8 || password !== confirm ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 16, padding: 36, width: '100%', maxWidth: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  )
}
