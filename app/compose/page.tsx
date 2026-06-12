'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PLATFORMS } from '@/lib/platforms'

interface SocialAccount {
  id: string
  platform: string
  accountType: string
  name: string
  handle?: string
  avatarUrl?: string
  isExpired?: boolean
}

interface GroupedAccounts {
  [platform: string]: SocialAccount[]
}

// ── Pre-publish readiness checks (defined outside component to avoid
//    initialization-order issues during static prerendering) ───────────────
const MEDIA_REQUIRED = new Set(['INSTAGRAM', 'PINTEREST'])

function getReadinessIssues(params: {
  accounts: GroupedAccounts
  selectedAccountIds: Set<string>
  mediaUrls: string[]
  text: string
}): string[] {
  const { accounts, selectedAccountIds, mediaUrls, text } = params
  const issues: string[] = []
  const selectedCount = selectedAccountIds.size
  if (selectedCount === 0) return issues

  const allAccounts: SocialAccount[] = Object.values(accounts).flat()
  const selectedAccounts = allAccounts.filter(a => selectedAccountIds.has(a.id))

  for (const acc of selectedAccounts) {
    if (acc.isExpired) {
      issues.push(`Token expired for ${acc.name} — reconnect before posting`)
    }
  }

  const selectedPlatforms = [...new Set(selectedAccounts.map(a => a.platform))]
  const needsMedia = selectedPlatforms.some(p => MEDIA_REQUIRED.has(p))
  if (needsMedia && mediaUrls.length === 0) {
    const reqPlatforms = selectedPlatforms.filter(p => MEDIA_REQUIRED.has(p))
      .map(p => PLATFORMS[p as keyof typeof PLATFORMS]?.name)
      .join(', ')
    issues.push(`${reqPlatforms} require${reqPlatforms.includes(',') ? '' : 's'} an image — add media before publishing`)
  }

  if (text.length > 0) {
    const overLimit = selectedPlatforms
      .map(p => ({ platform: p, limit: PLATFORMS[p as keyof typeof PLATFORMS]?.charLimit ?? Infinity }))
      .filter(({ limit }) => text.length > limit)
    if (overLimit.length > 0) {
      const names = overLimit.map(({ platform }) => PLATFORMS[platform as keyof typeof PLATFORMS]?.name).join(', ')
      issues.push(`Text exceeds character limit on ${names}`)
    }
  }

  return issues
}

export default function ComposePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [text, setText] = useState('')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [accounts, setAccounts] = useState<GroupedAccounts>({})
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set())
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set(['LINKEDIN', 'FACEBOOK']))
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error' | 'partial'; msg: string } | null>(null)
  const [activePreview, setActivePreview] = useState<string>('TWITTER')
  const [uploading, setUploading] = useState(false)

  const readinessIssues = getReadinessIssues({ accounts, selectedAccountIds, mediaUrls, text })
  const publishBlocked = readinessIssues.length > 0

  // Redirect if not logged in
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Load connected accounts
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/accounts')
      .then(r => r.json())
      .then(data => {
        setAccounts(data.grouped || {})
        // Auto-select all non-expired accounts
        const ids = new Set<string>()
        Object.values(data.accounts || []).forEach((acc: any) => {
          if (!acc.isExpired) ids.add(acc.id)
        })
        setSelectedAccountIds(ids)
      })
      .catch(console.error)
  }, [status])

  // Set default schedule time to now + 1 hour
  useEffect(() => {
    const d = new Date(Date.now() + 3600000)
    setScheduledAt(d.toISOString().split('T')[0])
    setScheduledTime(d.toTimeString().slice(0, 5))
  }, [])

  const toggleAccount = (id: string) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const togglePlatformAll = (platform: string) => {
    const platformAccounts = accounts[platform] || []
    const allSelected = platformAccounts.every(a => selectedAccountIds.has(a.id))
    setSelectedAccountIds(prev => {
      const next = new Set(prev)
      platformAccounts.forEach(a => allSelected ? next.delete(a.id) : next.add(a.id))
      return next
    })
  }

  const totalSelected = selectedAccountIds.size

  const handlePublish = async (schedule = false) => {
    if (!text.trim()) { setResult({ type: 'error', msg: 'Please write something first.' }); return }
    if (totalSelected === 0) { setResult({ type: 'error', msg: 'Select at least one account.' }); return }

    setPublishing(true)
    setResult(null)

    const body: any = {
      text,
      mediaUrls,
      targetAccountIds: [...selectedAccountIds],
    }

    if (schedule) {
      const dt = new Date(`${scheduledAt}T${scheduledTime}:00`)
      if (isNaN(dt.getTime())) { setResult({ type: 'error', msg: 'Invalid schedule date/time.' }); setPublishing(false); return }
      body.scheduledAt = dt.toISOString()
    }

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setResult({ type: 'error', msg: data.error || 'Something went wrong.' })
      } else if (schedule) {
        setResult({ type: 'success', msg: `Scheduled for ${new Date(`${scheduledAt}T${scheduledTime}`).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' })}` })
        setText('')
      } else if (data.status === 'published') {
        setResult({ type: 'success', msg: `Published to all ${data.successCount} destination${data.successCount !== 1 ? 's' : ''} successfully.` })
        setText('')
      } else if (data.status === 'partial') {
        setResult({ type: 'partial', msg: `Published to ${data.successCount} of ${data.totalTargets} destinations. ${data.failCount} failed.` })
      } else {
        setResult({ type: 'error', msg: `Failed to publish. Please check your connected accounts.` })
      }
    } catch (err) {
      setResult({ type: 'error', msg: 'Network error. Please try again.' })
    } finally {
      setPublishing(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setMediaUrls(prev => [...prev, data.url])
    } catch (err: any) {
      setResult({ type: 'error', msg: `Upload failed: ${err.message}` })
    } finally {
      setUploading(false)
    }
  }

  const platformList = Object.keys(PLATFORMS)
  const activePlatforms = platformList.filter(p => (accounts[p] || []).some(a => selectedAccountIds.has(a.id)))

  if (status === 'loading') return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.page}>

      {/* Left: Composer */}
      <div style={s.left}>

        {/* Text area */}
        <div style={s.card}>
          <div style={s.cardLabel}>Post Content</div>
          <textarea
            style={s.textarea}
            placeholder="What do you want to share?"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#777790' }}>
              {activePlatforms.length > 0
                ? `Posting to ${totalSelected} account${totalSelected !== 1 ? 's' : ''} across ${activePlatforms.length} platform${activePlatforms.length !== 1 ? 's' : ''}`
                : 'No platforms selected'}
            </span>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: text.length > 280 ? '#c47d00' : '#777790' }}>
              {text.length} chars
            </span>
          </div>
        </div>

        {/* Media */}
        <div style={s.card}>
          <div style={s.cardLabel}>Media</div>
          <label style={s.mediaZone}>
            <input type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading || mediaUrls.length >= 4} />
            {uploading
              ? <span style={{ color: '#7c6eff', fontSize: 13 }}>Uploading...</span>
              : <span style={{ fontSize: 13, color: '#777790' }}>
                  {mediaUrls.length >= 4 ? 'Max 4 files reached' : 'Click to upload image or video'}
                  <div style={{ fontSize: 11, color: '#aaaabc', marginTop: 4 }}>PNG, JPG, GIF, MP4 · Max 512MB</div>
                </span>
            }
          </label>
          {mediaUrls.length > 0 && (
            <div style={s.mediaGrid}>
              {mediaUrls.map((url, i) => (
                <div key={i} style={s.mediaThumb}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button style={s.mediaRemove} onClick={() => setMediaUrls(prev => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule */}
        <div style={s.card}>
          <div style={s.cardLabel}>Schedule (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={s.inputLabel}>Date</div>
              <input type="date" style={s.input} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
            <div>
              <div style={s.inputLabel}>Time (Ho Chi Minh)</div>
              <input type="time" style={s.input} value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Readiness warnings */}
        {publishBlocked && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, fontSize: 12,
            background: 'rgba(217,64,64,0.06)',
            border: '1px solid rgba(217,64,64,0.2)',
            color: '#c0392b',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠ Fix before publishing</div>
            {readinessIssues.map((issue, i) => (
              <div key={i} style={{ paddingLeft: 8, marginTop: i === 0 ? 0 : 2 }}>• {issue}</div>
            ))}
          </div>
        )}

        {/* Result banner */}
        {result && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, fontSize: 13,
            background: result.type === 'success' ? 'rgba(26,158,101,0.08)' : result.type === 'partial' ? 'rgba(196,125,0,0.08)' : 'rgba(217,64,64,0.08)',
            border: `1px solid ${result.type === 'success' ? 'rgba(26,158,101,0.25)' : result.type === 'partial' ? 'rgba(196,125,0,0.25)' : 'rgba(217,64,64,0.25)'}`,
            color: result.type === 'success' ? '#1a9e65' : result.type === 'partial' ? '#c47d00' : '#d94040',
          }}>
            {result.msg}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ ...s.btn, flex: 1, justifyContent: 'center', opacity: publishing || publishBlocked ? 0.5 : 1, cursor: publishBlocked ? 'not-allowed' : 'pointer' }}
            onClick={() => handlePublish(true)}
            disabled={publishing || publishBlocked}
          >
            📅 Schedule
          </button>
          <button
            style={{ ...s.btnPrimary, flex: 2, justifyContent: 'center', opacity: publishing || publishBlocked ? 0.5 : 1, cursor: publishBlocked ? 'not-allowed' : 'pointer' }}
            onClick={() => handlePublish(false)}
            disabled={publishing || publishBlocked}
          >
            {publishing ? 'Publishing...' : publishBlocked ? 'Fix issues above first' : `Publish Now → ${totalSelected} account${totalSelected !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>

      {/* Right: Platform selector + preview */}
      <div style={s.right}>

        {/* Platform + account selector */}
        <div style={s.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={s.cardLabel}>Platforms</div>
            {Object.keys(accounts).length === 0 && (
              <button style={s.btnLink} onClick={() => router.push('/accounts')}>
                Connect accounts →
              </button>
            )}
          </div>

          {Object.keys(accounts).length === 0 ? (
            <div style={s.emptyAccounts}>
              <p style={{ color: '#555566', fontSize: 13, textAlign: 'center', margin: 0 }}>
                No accounts connected yet.<br />
                <button style={{ ...s.btnLink, marginTop: 8, display: 'inline-block' }} onClick={() => router.push('/accounts')}>
                  Connect your first account →
                </button>
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {platformList.filter(p => accounts[p]?.length > 0).map(platformId => {
                const p = PLATFORMS[platformId as keyof typeof PLATFORMS]
                const platformAccounts = accounts[platformId] || []
                const allSelected = platformAccounts.every(a => selectedAccountIds.has(a.id))
                const someSelected = platformAccounts.some(a => selectedAccountIds.has(a.id))
                const isExpanded = expandedPlatforms.has(platformId)

                return (
                  <div key={platformId}>
                    {/* Platform row */}
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        background: someSelected ? 'rgba(124,110,255,0.07)' : '#f0f0f5',
                        border: `1px solid ${someSelected ? 'rgba(124,110,255,0.25)' : 'rgba(0,0,0,0.07)'}`,
                      }}
                      onClick={() => togglePlatformAll(platformId)}
                    >
                      <div style={{ width: 26, height: 26, borderRadius: 6, background: p.color + '22', color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {p.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#777790' }}>
                          {platformAccounts.filter(a => selectedAccountIds.has(a.id)).length}/{platformAccounts.length} selected
                        </div>
                      </div>
                      {/* Expand toggle for multi-account platforms */}
                      <button
                        style={s.expandBtn}
                        onClick={e => { e.stopPropagation(); setExpandedPlatforms(prev => { const n = new Set(prev); n.has(platformId) ? n.delete(platformId) : n.add(platformId); return n }) }}
                      >
                        {isExpanded ? '▲' : '▼'}
                      </button>
                      {/* Check state */}
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${allSelected ? '#7c6eff' : someSelected ? '#7c6eff' : 'rgba(0,0,0,0.18)'}`, background: allSelected ? '#7c6eff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {allSelected && <span style={{ color: 'white', fontSize: 10, fontWeight: 700 }}>✓</span>}
                        {someSelected && !allSelected && <span style={{ color: '#7c6eff', fontSize: 14, lineHeight: 1 }}>–</span>}
                      </div>
                    </div>

                    {/* Individual account rows */}
                    {isExpanded && (
                      <div style={{ marginLeft: 36, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {platformAccounts.map(acc => {
                          const isSel = selectedAccountIds.has(acc.id)
                          return (
                            <div
                              key={acc.id}
                              onClick={() => toggleAccount(acc.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                                background: isSel ? 'rgba(124,110,255,0.05)' : 'transparent',
                                border: `1px solid ${isSel ? 'rgba(124,110,255,0.2)' : 'transparent'}`,
                              }}
                            >
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: p.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: p.color, flexShrink: 0, overflow: 'hidden' }}>
                                {acc.avatarUrl
                                  ? <img src={acc.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : acc.name.charAt(0)
                                }
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: '#2a2a3e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                                {acc.isExpired && <div style={{ fontSize: 10, color: '#d94040' }}>Token expired — reconnect</div>}
                              </div>
                              <div style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${isSel ? '#7c6eff' : 'rgba(0,0,0,0.18)'}`, background: isSel ? '#7c6eff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {isSel && <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>}
                              </div>
                            </div>
                          )
                        })}
                        <button
                          style={s.addMoreBtn}
                          onClick={() => router.push(`/api/oauth/${platformId.toLowerCase()}/start`)}
                        >
                          + Add another {PLATFORMS[platformId as keyof typeof PLATFORMS]?.name} account
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Character limit checker */}
        {text.length > 0 && activePlatforms.length > 0 && (
          <div style={s.card}>
            <div style={s.cardLabel}>Character limits</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {activePlatforms.map(platformId => {
                const p = PLATFORMS[platformId as keyof typeof PLATFORMS]
                const over = text.length > p.charLimit
                const warn = text.length > p.charLimit * 0.85
                return (
                  <div
                    key={platformId}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: '#f0f0f5', cursor: 'pointer', border: `1px solid ${activePreview === platformId ? 'rgba(124,110,255,0.3)' : 'transparent'}` }}
                    onClick={() => setActivePreview(platformId)}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: p.color + '22', color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>{p.icon}</div>
                    <span style={{ flex: 1, fontSize: 12, color: '#555570' }}>{p.name}</span>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', color: over ? '#d94040' : warn ? '#c47d00' : '#1a9e65', background: over ? 'rgba(217,64,64,0.08)' : warn ? 'rgba(196,125,0,0.08)' : 'rgba(26,158,101,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                      {text.length}/{p.charLimit}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Post preview */}
        <div style={s.card}>
          <div style={s.cardLabel}>
            Preview · {PLATFORMS[activePreview as keyof typeof PLATFORMS]?.name || 'Platform'}
          </div>
          <div style={s.preview}>
            {text || <span style={{ color: '#aaaabc', fontStyle: 'italic' }}>Start typing to preview...</span>}
          </div>
          {mediaUrls.length > 0 && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
              {mediaUrls.slice(0, 4).map((url, i) => (
                <img key={i} src={url} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 6 }} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, padding: 24, minHeight: '100vh', background: '#f5f5f8', alignItems: 'start' },
  left: { display: 'flex', flexDirection: 'column', gap: 16 },
  right: { display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 18 },
  cardLabel: { fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: '#888899', textTransform: 'uppercase', marginBottom: 12 },
  textarea: { width: '100%', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 8, color: '#1a1a2e', fontFamily: 'inherit', fontSize: 14, padding: '12px 14px', resize: 'none', outline: 'none', minHeight: 140, lineHeight: 1.6, boxSizing: 'border-box' },
  mediaZone: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, border: '1px dashed rgba(0,0,0,0.13)', borderRadius: 8, cursor: 'pointer', textAlign: 'center' },
  mediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 },
  mediaThumb: { aspectRatio: '1', borderRadius: 6, overflow: 'hidden', position: 'relative', background: '#ededf2' },
  mediaRemove: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', color: 'white', cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontSize: 11, color: '#777790', marginBottom: 5 },
  input: { width: '100%', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 7, color: '#1a1a2e', fontFamily: 'inherit', fontSize: 13, padding: '8px 10px', outline: 'none', boxSizing: 'border-box' },
  btn: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, color: '#1a1a2e', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnLink: { background: 'none', border: 'none', color: '#7c6eff', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  expandBtn: { width: 18, height: 18, background: '#ededf2', border: 'none', borderRadius: 4, color: '#777790', cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  addMoreBtn: { padding: '5px 8px', background: 'none', border: '1px dashed rgba(0,0,0,0.10)', borderRadius: 6, color: '#888899', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  emptyAccounts: { padding: 20, background: '#f0f0f5', borderRadius: 8, border: '1px dashed rgba(0,0,0,0.09)' },
  preview: { fontSize: 13, color: '#3a3a50', lineHeight: 1.7, minHeight: 70, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#777790', fontSize: 14, background: '#f5f5f8' },
}
