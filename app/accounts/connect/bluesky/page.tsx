'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function BlueskyConnectPage() {
  const router = useRouter()
  const [handle, setHandle] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!handle.trim() || !appPassword.trim()) {
      setError('Please enter both your handle and app password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/oauth/bluesky/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handle: handle.replace('@', '').trim(),
          appPassword: appPassword.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Connection failed')
      router.push('/accounts?success=bluesky')
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Check your handle and app password.')
      setLoading(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.icon}>☁</div>
          <div>
            <h2 style={s.title}>Connect Bluesky</h2>
            <p style={s.sub}>Uses an App Password — not your main password</p>
          </div>
        </div>

        <div style={s.divider} />

        <div style={s.infoBox}>
          <strong style={{ color: '#f0f0f2' }}>What is an App Password?</strong><br />
          Bluesky lets you create separate passwords for third-party apps — so Postify never touches your real login credentials. You can revoke it anytime.
          <br /><br />
          <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noreferrer" style={{ color: '#0085ff' }}>
            Generate an App Password at bsky.app/settings/app-passwords →
          </a>
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={s.label}>Your Bluesky handle</label>
            <input
              style={s.input}
              type="text"
              placeholder="yourname.bsky.social"
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
            />
          </div>
          <div>
            <label style={s.label}>App Password</label>
            <input
              style={s.input}
              type="password"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              value={appPassword}
              onChange={e => setAppPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
            />
          </div>
        </div>

        {error && (
          <div style={s.errorBox}>{error}</div>
        )}

        <div style={s.divider} />

        <div style={s.footer}>
          <button style={s.btnSecondary} onClick={() => router.push('/accounts')}>Cancel</button>
          <button
            style={{ ...s.btnPrimary, opacity: loading ? 0.6 : 1 }}
            onClick={handleConnect}
            disabled={loading}
          >
            {loading ? 'Connecting...' : 'Connect Account'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#0f0f11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#17171a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460 },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  icon: { width: 44, height: 44, background: '#0085ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, flexShrink: 0 },
  title: { fontSize: 18, fontWeight: 600, color: '#f0f0f2', margin: 0 },
  sub: { fontSize: 13, color: '#9999aa', margin: '3px 0 0' },
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '20px 0' },
  infoBox: { padding: '14px 16px', background: 'rgba(0,133,255,0.06)', border: '1px solid rgba(0,133,255,0.2)', borderRadius: 10, fontSize: 13, color: '#9999aa', lineHeight: 1.7 },
  label: { display: 'block', fontSize: 12, color: '#9999aa', marginBottom: 6 },
  input: { width: '100%', background: '#1e1e22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f0f0f2', fontSize: 14, padding: '10px 12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  errorBox: { marginTop: 12, padding: '10px 14px', background: 'rgba(255,95,95,0.08)', border: '1px solid rgba(255,95,95,0.25)', borderRadius: 8, fontSize: 13, color: '#ff5f5f' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  btnPrimary: { padding: '10px 20px', background: '#0085ff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9999aa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
}
