'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface LinkedInPage {
  id: string
  urn: string
  name: string
  vanityName?: string
  logoUrl?: string
}

interface PendingData {
  accessToken: string
  tokenExpiry: string
  profile: { id: string; name: string; email: string; picture?: string }
  pages: LinkedInPage[]
}

export default function LinkedInConnectPage() {
  return (
    <Suspense fallback={<div style={styles.wrap}>Loading LinkedIn accounts...</div>}>
      <LinkedInConnectContent />
    </Suspense>
  )
}

function LinkedInConnectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<PendingData | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = searchParams.get('data')
    if (!raw) { setError('No data received from LinkedIn.'); return }
    try {
      const parsed = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
      setData(parsed)
      // Pre-select all pages by default
      setSelected(new Set(parsed.pages.map((p: LinkedInPage) => p.id)))
    } catch {
      setError('Failed to parse LinkedIn response.')
    }
  }, [searchParams])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!data || selected.size === 0) return
    setSaving(true)
    try {
      const res = await fetch('/api/oauth/linkedin/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: data.accessToken,
          tokenExpiry: data.tokenExpiry,
          profile: data.profile,
          selectedPageIds: [...selected],
          allPages: data.pages,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      router.push('/accounts?success=linkedin')
    } catch {
      setError('Failed to save accounts. Please try again.')
      setSaving(false)
    }
  }

  if (error) return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.errorIcon}>✕</div>
        <h2 style={styles.title}>Something went wrong</h2>
        <p style={styles.sub}>{error}</p>
        <button style={styles.btnPrimary} onClick={() => router.push('/accounts')}>
          Back to Accounts
        </button>
      </div>
    </div>
  )

  if (!data) return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={{ ...styles.sub, marginTop: 16 }}>Loading your LinkedIn pages...</p>
      </div>
    </div>
  )

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.liIcon}>in</div>
          <div>
            <h2 style={styles.title}>Connect LinkedIn Pages</h2>
            <p style={styles.sub}>
              Signed in as <strong>{data.profile.name}</strong> · {data.profile.email}
            </p>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Page count summary */}
        <div style={styles.summary}>
          <span style={styles.summaryText}>
            {data.pages.length === 0
              ? 'No pages found — you need to be an admin of at least one LinkedIn Page.'
              : `${data.pages.length} page${data.pages.length > 1 ? 's' : ''} found where you are an admin`}
          </span>
          {data.pages.length > 1 && (
            <button
              style={styles.btnLink}
              onClick={() =>
                selected.size === data.pages.length
                  ? setSelected(new Set())
                  : setSelected(new Set(data.pages.map(p => p.id)))
              }
            >
              {selected.size === data.pages.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        {/* Page list */}
        {data.pages.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={{ color: '#9999aa', fontSize: 14 }}>
              To use LinkedIn posting, you need to be an administrator of a LinkedIn Page.
              <br /><br />
              <a href="https://www.linkedin.com/help/linkedin/answer/a543852" target="_blank" rel="noreferrer" style={{ color: '#7c6eff' }}>
                Learn how to create a LinkedIn Page →
              </a>
            </p>
          </div>
        ) : (
          <div style={styles.pageList}>
            {data.pages.map(page => {
              const isSelected = selected.has(page.id)
              return (
                <div
                  key={page.id}
                  style={{ ...styles.pageItem, ...(isSelected ? styles.pageItemSelected : {}) }}
                  onClick={() => toggle(page.id)}
                >
                  {/* Logo or initial */}
                  <div style={styles.pageAvatar}>
                    {page.logoUrl ? (
                      <img src={page.logoUrl} alt={page.name} style={styles.pageAvatarImg} />
                    ) : (
                      <span style={styles.pageAvatarInitial}>
                        {page.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div style={styles.pageInfo}>
                    <div style={styles.pageName}>{page.name}</div>
                    {page.vanityName && (
                      <div style={styles.pageHandle}>linkedin.com/company/{page.vanityName}</div>
                    )}
                  </div>

                  {/* Checkbox */}
                  <div style={{ ...styles.checkbox, ...(isSelected ? styles.checkboxSelected : {}) }}>
                    {isSelected && <span style={styles.checkmark}>✓</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={styles.divider} />

        {/* Footer actions */}
        <div style={styles.footer}>
          <button style={styles.btnSecondary} onClick={() => router.push('/accounts')}>
            Cancel
          </button>
          <button
            style={{
              ...styles.btnPrimary,
              opacity: selected.size === 0 || saving ? 0.5 : 1,
              cursor: selected.size === 0 || saving ? 'not-allowed' : 'pointer',
            }}
            onClick={handleSave}
            disabled={selected.size === 0 || saving}
          >
            {saving
              ? 'Connecting...'
              : `Connect ${selected.size > 0 ? selected.size : ''} Page${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: '#0f0f11',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    background: '#17171a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '28px',
    width: '100%',
    maxWidth: '520px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginBottom: '20px',
  },
  liIcon: {
    width: '44px',
    height: '44px',
    background: '#0077b5',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '18px',
    fontWeight: '700',
    flexShrink: 0,
  },
  title: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#f0f0f2',
    margin: 0,
  },
  sub: {
    fontSize: '13px',
    color: '#9999aa',
    margin: '3px 0 0',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.07)',
    margin: '18px 0',
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  summaryText: {
    fontSize: '12px',
    color: '#9999aa',
  },
  btnLink: {
    background: 'none',
    border: 'none',
    color: '#7c6eff',
    fontSize: '12px',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
  },
  pageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '360px',
    overflowY: 'auto',
  },
  pageItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.07)',
    cursor: 'pointer',
    background: '#1e1e22',
    transition: 'all 0.15s',
    userSelect: 'none',
  },
  pageItemSelected: {
    border: '1px solid rgba(124,110,255,0.5)',
    background: 'rgba(124,110,255,0.08)',
  },
  pageAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: '#0077b522',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  pageAvatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  pageAvatarInitial: {
    color: '#0077b5',
    fontSize: '16px',
    fontWeight: '700',
  },
  pageInfo: {
    flex: 1,
    minWidth: 0,
  },
  pageName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#f0f0f2',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  pageHandle: {
    fontSize: '11px',
    color: '#555566',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '1.5px solid rgba(255,255,255,0.2)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s',
  },
  checkboxSelected: {
    background: '#7c6eff',
    border: '1.5px solid #7c6eff',
  },
  checkmark: {
    color: 'white',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: 1,
  },
  emptyState: {
    padding: '24px',
    background: '#1e1e22',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.07)',
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
  },
  btnPrimary: {
    padding: '10px 20px',
    background: '#7c6eff',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  btnSecondary: {
    padding: '10px 16px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '8px',
    color: '#9999aa',
    fontSize: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  errorIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'rgba(255,95,95,0.1)',
    border: '1px solid rgba(255,95,95,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ff5f5f',
    fontSize: '20px',
    margin: '0 auto 16px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '3px solid rgba(124,110,255,0.2)',
    borderTopColor: '#7c6eff',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto',
  },
}
