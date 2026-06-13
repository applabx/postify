'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }
      setSuccess(true)
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 16, padding: 36, width: '100%', maxWidth: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ width: 44, height: 44, background: '#7c6eff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', margin: '0 auto 16px' }}>P</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 6px', textAlign: 'center' }}>Reset password</h1>
        <p style={{ fontSize: 13, color: '#888899', margin: '0 0 28px', textAlign: 'center' }}>
          {success
            ? 'If an account exists, we sent a reset link.'
            : "Enter your email and we'll send you a reset link."}
        </p>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
            <p style={{ fontSize: 13, color: '#555', margin: '0 0 20px' }}>
              Check <strong>{email}</strong> for a reset link.<br />
              The link expires in 1 hour.
            </p>
            <Link href="/login" style={{ color: '#7c6eff', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ fontSize: 12, fontWeight: 500, color: '#555', display: 'block', marginBottom: 4 }}>Email address</label>
            <input
              type="email"
              placeholder="alex@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', display: 'block' }}
            />
            {error && <p style={{ fontSize: 12, color: '#d94040', marginTop: 10 }}>{error}</p>}
            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{ width: '100%', padding: '12px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, fontFamily: 'inherit', marginTop: 16, opacity: loading || !email.trim() ? 0.5 : 1, cursor: loading || !email.trim() ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
            <p style={{ fontSize: 13, color: '#555', textAlign: 'center', marginTop: 20, marginBottom: 0 }}>
              Remember your password?{' '}
              <Link href="/login" style={{ color: '#7c6eff', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
