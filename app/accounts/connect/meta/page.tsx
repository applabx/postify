'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface FacebookPage {
  id: string
  name: string
  category: string
  pictureUrl?: string
  pageAccessToken: string
  instagramAccountId?: string
}

interface FacebookGroup {
  id: string
  name: string
  privacy: string
  pictureUrl?: string
}

interface PendingData {
  accessToken: string
  pages: FacebookPage[]
  groups: FacebookGroup[]
}

type TabId = 'pages' | 'groups' | 'instagram'

export default function MetaConnectPage() {
  return (
    <Suspense fallback={<div style={s.wrap}>Loading Meta accounts...</div>}>
      <MetaConnectContent />
    </Suspense>
  )
}

function MetaConnectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<PendingData | null>(null)
  const [tab, setTab] = useState<TabId>('pages')
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [connectInstagram, setConnectInstagram] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = searchParams.get('data')
    if (!raw) { setError('No data received.'); return }
    try {
      const parsed = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
      setData(parsed)
      setSelectedPages(new Set(parsed.pages.map((p: FacebookPage) => p.id)))
    } catch {
      setError('Failed to parse Meta response.')
    }
  }, [searchParams])

  const igPages = data?.pages.filter(p => p.instagramAccountId) || []

  const totalSelected =
    selectedPages.size +
    selectedGroups.size +
    (connectInstagram ? igPages.length : 0)

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch('/api/oauth/meta/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: data.accessToken,
          selectedPageIds: [...selectedPages],
          selectedGroupIds: [...selectedGroups],
          connectInstagram,
          allPages: data.pages,
          allGroups: data.groups,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      router.push('/accounts?success=meta')
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  if (error) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={{ color: '#ff5f5f', textAlign: 'center' }}>{error}</p>
        <button style={s.btnPrimary} onClick={() => router.push('/accounts')}>Back</button>
      </div>
    </div>
  )

  if (!data) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.spinner} />
        <p style={{ color: '#9999aa', textAlign: 'center', marginTop: 16 }}>Loading your Meta accounts...</p>
      </div>
    </div>
  )

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: 'pages', label: 'Facebook Pages', count: data.pages.length },
    { id: 'groups', label: 'Facebook Groups', count: data.groups.length },
    { id: 'instagram', label: 'Instagram', count: igPages.length },
  ]

  return (
    <div style={s.wrap}>
      <div style={s.card}>

        <div style={s.header}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ ...s.platformIcon, background: '#1877f2' }}>f</div>
            <div style={{ ...s.platformIcon, background: '#e1306c' }}>◈</div>
            <div style={{ ...s.platformIcon, background: '#101010' }}>@</div>
          </div>
          <div>
            <h2 style={s.title}>Connect Meta Accounts</h2>
            <p style={s.sub}>Facebook Pages, Groups, Instagram & Threads</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {tabs.map(t => (
            <button
              key={t.id}
              style={{ ...s.tab, ...(tab === t.id ? s.tabActive : {}) }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span style={{ ...s.tabBadge, ...(tab === t.id ? s.tabBadgeActive : {}) }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Pages tab */}
        {tab === 'pages' && (
          <div>
            <div style={s.tabHeader}>
              <span style={s.tabDesc}>Select which Facebook Pages to post to</span>
              <button style={s.btnLink} onClick={() =>
                selectedPages.size === data.pages.length
                  ? setSelectedPages(new Set())
                  : setSelectedPages(new Set(data.pages.map(p => p.id)))
              }>
                {selectedPages.size === data.pages.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {data.pages.length === 0
              ? <EmptyState msg="No Facebook Pages found where you are an admin." />
              : <ItemList
                  items={data.pages.map(p => ({ id: p.id, name: p.name, sub: p.category, avatarUrl: p.pictureUrl, color: '#1877f2' }))}
                  selected={selectedPages}
                  onToggle={id => setSelectedPages(prev => toggleSet(prev, id))}
                />
            }
          </div>
        )}

        {/* Groups tab */}
        {tab === 'groups' && (
          <div>
            <div style={s.tabHeader}>
              <span style={s.tabDesc}>Select Facebook Groups you manage</span>
              <button style={s.btnLink} onClick={() =>
                selectedGroups.size === data.groups.length
                  ? setSelectedGroups(new Set())
                  : setSelectedGroups(new Set(data.groups.map(g => g.id)))
              }>
                {selectedGroups.size === data.groups.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {data.groups.length === 0
              ? <EmptyState msg="No Facebook Groups found where you are an admin." />
              : <ItemList
                  items={data.groups.map(g => ({ id: g.id, name: g.name, sub: g.privacy, color: '#1877f2' }))}
                  selected={selectedGroups}
                  onToggle={id => setSelectedGroups(prev => toggleSet(prev, id))}
                />
            }
          </div>
        )}

        {/* Instagram tab */}
        {tab === 'instagram' && (
          <div>
            <div style={s.tabHeader}>
              <span style={s.tabDesc}>Instagram Business/Creator accounts linked to your Pages</span>
            </div>
            {igPages.length === 0 ? (
              <EmptyState msg="No Instagram Business accounts linked to your Facebook Pages. Connect your Instagram account to a Facebook Page first." />
            ) : (
              <>
                <div style={s.igToggleRow}>
                  <span style={{ fontSize: 13, color: '#f0f0f2' }}>
                    Connect {igPages.length} Instagram account{igPages.length > 1 ? 's' : ''}
                  </span>
                  <div
                    style={{ ...s.toggle, ...(connectInstagram ? s.toggleOn : {}) }}
                    onClick={() => setConnectInstagram(v => !v)}
                  >
                    <div style={{ ...s.toggleDot, ...(connectInstagram ? s.toggleDotOn : {}) }} />
                  </div>
                </div>
                <ItemList
                  items={igPages.map(p => ({ id: p.id, name: `@${p.name}`, sub: 'Instagram Business', color: '#e1306c' }))}
                  selected={connectInstagram ? new Set(igPages.map(p => p.id)) : new Set()}
                  onToggle={() => setConnectInstagram(v => !v)}
                />
              </>
            )}

            <div style={{ ...s.infoBox, marginTop: 16 }}>
              <strong style={{ color: '#f0f0f2' }}>Threads</strong> will also be connected automatically
              if your Instagram account has Threads enabled.
            </div>
          </div>
        )}

        <div style={s.divider} />

        <div style={s.footer}>
          <span style={{ fontSize: 12, color: '#9999aa' }}>
            {totalSelected} account{totalSelected !== 1 ? 's' : ''} will be connected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.btnSecondary} onClick={() => router.push('/accounts')}>Cancel</button>
            <button
              style={{ ...s.btnPrimary, opacity: totalSelected === 0 || saving ? 0.5 : 1 }}
              onClick={handleSave}
              disabled={totalSelected === 0 || saving}
            >
              {saving ? 'Connecting...' : `Connect ${totalSelected > 0 ? totalSelected : ''} Account${totalSelected !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function toggleSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  next.has(id) ? next.delete(id) : next.add(id)
  return next
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '24px', background: '#1e1e22', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
      <p style={{ color: '#9999aa', fontSize: 13 }}>{msg}</p>
    </div>
  )
}

function ItemList({ items, selected, onToggle }: {
  items: { id: string; name: string; sub?: string; avatarUrl?: string; color: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
      {items.map(item => {
        const isSel = selected.has(item.id)
        return (
          <div
            key={item.id}
            onClick={() => onToggle(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
              background: isSel ? 'rgba(124,110,255,0.08)' : '#1e1e22',
              border: `1px solid ${isSel ? 'rgba(124,110,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
              userSelect: 'none',
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 8, background: item.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {item.avatarUrl
                ? <img src={item.avatarUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ color: item.color, fontWeight: 700, fontSize: 14 }}>{item.name.charAt(0)}</span>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#f0f0f2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              {item.sub && <div style={{ fontSize: 11, color: '#555566', marginTop: 2 }}>{item.sub}</div>}
            </div>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${isSel ? '#7c6eff' : 'rgba(255,255,255,0.2)'}`, background: isSel ? '#7c6eff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isSel && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#0f0f11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#17171a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560 },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  platformIcon: { width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 700 },
  title: { fontSize: 18, fontWeight: 600, color: '#f0f0f2', margin: 0 },
  sub: { fontSize: 13, color: '#9999aa', margin: '3px 0 0' },
  tabs: { display: 'flex', gap: 4, marginBottom: 16, background: '#1e1e22', borderRadius: 10, padding: 4 },
  tab: { flex: 1, padding: '7px 8px', borderRadius: 7, border: 'none', background: 'transparent', color: '#9999aa', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabActive: { background: '#26262c', color: '#f0f0f2' },
  tabBadge: { background: '#26262c', color: '#555566', padding: '1px 5px', borderRadius: 10, fontSize: 10, fontWeight: 600 },
  tabBadgeActive: { background: 'rgba(124,110,255,0.2)', color: '#7c6eff' },
  tabHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  tabDesc: { fontSize: 12, color: '#9999aa' },
  btnLink: { background: 'none', border: 'none', color: '#7c6eff', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  igToggleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#1e1e22', borderRadius: 10, marginBottom: 10, border: '1px solid rgba(255,255,255,0.07)' },
  toggle: { width: 40, height: 22, borderRadius: 11, background: '#26262c', border: '1px solid rgba(255,255,255,0.12)', position: 'relative', cursor: 'pointer', transition: 'all 0.2s' },
  toggleOn: { background: '#7c6eff', border: '1px solid #7c6eff' },
  toggleDot: { position: 'absolute', top: 3, left: 3, width: 14, height: 14, borderRadius: '50%', background: '#9999aa', transition: 'all 0.2s' },
  toggleDotOn: { left: 21, background: 'white' },
  infoBox: { padding: '10px 14px', background: 'rgba(124,110,255,0.06)', border: '1px solid rgba(124,110,255,0.2)', borderRadius: 8, fontSize: 12, color: '#9999aa', lineHeight: 1.6 },
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '18px 0' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  btnPrimary: { padding: '10px 20px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9999aa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  spinner: { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(124,110,255,0.2)', borderTopColor: '#7c6eff', margin: '0 auto' },
}
