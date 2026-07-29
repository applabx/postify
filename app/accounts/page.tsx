'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PLATFORMS } from '@/lib/platforms'

interface SocialAccount {
  id: string
  platform: string
  accountType: string
  name: string
  handle?: string
  avatarUrl?: string
  tokenExpiry?: string
  isExpired?: boolean
}

const CONNECT_PATHS: Record<string, string> = {
  LINKEDIN: '/api/oauth/linkedin/start',
  FACEBOOK: '/api/oauth/meta/start',
  INSTAGRAM: '/api/oauth/meta/start',
  THREADS: '/api/oauth/meta/start',
  TWITTER: '/api/oauth/twitter/start',
  BLUESKY: '/accounts/connect/bluesky',
  PINTEREST: '/api/oauth/pinterest/start',
  TUMBLR: '/api/oauth/tumblr/start',
}

export default function AccountsPage() {
  return (
    <Suspense fallback={<div style={s.page}>Loading accounts...</div>}>
      <AccountsContent />
    </Suspense>
  )
}

function AccountsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<Record<string, SocialAccount[]>>({})
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    // Show success/error toasts from OAuth callbacks
    const success = searchParams.get('success')
    const error = searchParams.get('error')
    if (success) {
      if (success === 'linkedin_personal') {
        showToast('✓ LinkedIn personal account connected. Page connection requires additional LinkedIn org permissions.')
      } else {
        const names: Record<string, string> = { linkedin: 'LinkedIn', meta: 'Meta (Facebook/Instagram/Threads)', twitter: 'X (Twitter)', bluesky: 'Bluesky', pinterest: 'Pinterest', tumblr: 'Tumblr' }
        showToast(`✓ ${names[success] || success} connected successfully`)
      }
    }
    if (error) {
      const msgs: Record<string, string> = {
        linkedin_denied: 'LinkedIn connection was cancelled.',
        linkedin_state_mismatch: 'LinkedIn auth failed — session expired. Please try again.',
        linkedin_pages_permissions_required: 'LinkedIn Page permissions are missing on your app. Request/enable r_organization_admin and w_organization_social in LinkedIn Developer Portal.',
        linkedin_failed: 'LinkedIn connection failed. Please try again.',
        meta_denied: 'Meta connection was cancelled.',
        meta_state_mismatch: 'Meta auth failed — session expired. Please try again.',
        meta_failed: 'Meta connection failed. Please try again.',
        twitter_denied: 'Twitter connection was cancelled.',
        twitter_state_mismatch: 'Twitter auth failed (state mismatch). Please try again.',
        twitter_no_verifier: 'Twitter auth failed — session expired. Please try again.',
        twitter_failed: 'Twitter connection failed. Please try again.',
        pinterest_denied: 'Pinterest connection was cancelled.',
        pinterest_state_mismatch: 'Pinterest auth failed — session expired. Please try again.',
        pinterest_failed: 'Pinterest connection failed. Please try again.',
        tumblr_denied: 'Tumblr connection was cancelled.',
        tumblr_state_mismatch: 'Tumblr auth failed — session expired. Please try again.',
        tumblr_init_failed: 'Tumblr connection failed. Please try again later.',
        tumblr_failed: 'Tumblr connection failed. Please try again.',
        bluesky_failed: 'Bluesky connection failed. Check your handle and app password.',
      }
      showToast(msgs[error] || `Connection failed: ${error}`, true)
    }
  }, [searchParams])

  useEffect(() => {
    loadAccounts()
  }, [])

  async function loadAccounts() {
    setLoading(true)
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      setAccounts(data.grouped || {})
    } catch {
      showToast('Failed to load accounts', true)
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async (accountId: string) => {
    if (!confirm('Disconnect this account? Scheduled posts targeting it will fail.')) return
    setDisconnecting(accountId)
    try {
      await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' })
      await loadAccounts()
      showToast('Account disconnected')
    } catch {
      showToast('Failed to disconnect', true)
    } finally {
      setDisconnecting(null)
    }
  }

  function showToast(msg: string, isError = false) {
    setToast(isError ? `✕ ${msg}` : msg)
    setTimeout(() => setToast(''), 4000)
  }

  const platformOrder = ['LINKEDIN', 'FACEBOOK', 'INSTAGRAM', 'THREADS', 'TWITTER', 'BLUESKY', 'PINTEREST', 'TUMBLR']

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Connected Accounts</h1>
          <p style={s.sub}>Manage your social media connections. Each connected account can be targeted individually when publishing.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ color: '#777790', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading accounts...</div>
      ) : (
        <div style={s.grid}>
          {platformOrder.map(platformId => {
            const p = PLATFORMS[platformId as keyof typeof PLATFORMS] as any
            if (!p) return null
            const platformAccounts = accounts[platformId] || []
            const connectPath = CONNECT_PATHS[platformId]

            return (
              <div key={platformId} style={s.card}>
                {/* Card header */}
                <div style={s.cardHeader}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: p.color + '22', color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                    {p.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={s.platformName}>{p.name}</div>
                    <div style={s.platformSub}>{platformAccounts.length} connected</div>
                  </div>
                  {platformId === 'TWITTER' && (
                    <span style={s.warningBadge}>$100/mo plan needed</span>
                  )}
                </div>

                {/* Account list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {platformAccounts.length === 0 ? (
                    <div style={s.emptySlot}>No accounts connected</div>
                  ) : (
                    platformAccounts.map(acc => (
                      <div key={acc.id} style={s.accountRow}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: p.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: p.color, flexShrink: 0, overflow: 'hidden' }}>
                          {acc.avatarUrl
                            ? <img src={acc.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : acc.name.charAt(0).toUpperCase()
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: '#2a2a3e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                          {acc.handle && <div style={{ fontSize: 11, color: '#888899' }}>{acc.handle}</div>}
                          {acc.isExpired && <div style={{ fontSize: 10, color: '#d94040' }}>Token expired — reconnect</div>}
                        </div>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: acc.isExpired ? '#d94040' : '#1a9e65', flexShrink: 0 }} />
                        <button
                          style={s.disconnectBtn}
                          onClick={() => disconnect(acc.id)}
                          disabled={disconnecting === acc.id}
                          title="Disconnect"
                        >
                          {disconnecting === acc.id ? '...' : '✕'}
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Connect button */}
                <button
                  style={s.connectBtn}
                  onClick={() => {
                    // Bluesky goes to a form; others trigger OAuth redirect
                    if (platformId === 'BLUESKY') router.push(connectPath)
                    else window.location.href = connectPath
                  }}
                >
                  + Connect {platformAccounts.length > 0 ? 'another' : 'an'} account
                </button>

                {/* Notes */}
                {p.note && (
                  <div style={s.noteBox}>{p.note}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#ffffff', border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1a1a2e',
          zIndex: 9999, maxWidth: 320,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, minHeight: '100vh', background: '#f5f5f8' },
  header: { marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 4px' },
  sub: { fontSize: 13, color: '#777790', margin: 0 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 },
  card: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 18 },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  platformName: { fontSize: 14, fontWeight: 600, color: '#1a1a2e' },
  platformSub: { fontSize: 11, color: '#888899', marginTop: 1 },
  warningBadge: { fontSize: 10, background: 'rgba(196,125,0,0.08)', color: '#c47d00', padding: '3px 7px', borderRadius: 5, fontWeight: 500 },
  accountRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.07)' },
  emptySlot: { padding: '10px 12px', borderRadius: 8, background: '#f5f5f8', border: '1px dashed rgba(0,0,0,0.09)', fontSize: 12, color: '#aaaabc', textAlign: 'center' },
  disconnectBtn: { background: 'none', border: 'none', color: '#aaaabc', cursor: 'pointer', fontSize: 12, padding: '2px 4px', borderRadius: 3, transition: 'color 0.15s', flexShrink: 0 },
  connectBtn: { width: '100%', padding: '8px', background: 'none', border: '1px dashed rgba(0,0,0,0.12)', borderRadius: 8, color: '#888899', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' },
  noteBox: { marginTop: 8, padding: '8px 10px', background: 'rgba(196,125,0,0.05)', border: '1px solid rgba(196,125,0,0.15)', borderRadius: 7, fontSize: 11, color: '#886644' },
}
