'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Board {
  id: string
  name: string
  description?: string
  privacy: string
  media?: { image_cover_url?: string }
}

interface PendingData {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  boards: Board[]
}

export default function PinterestConnectPage() {
  return (
    <Suspense fallback={<div style={s.wrap}>Loading Pinterest boards...</div>}>
      <PinterestConnectContent />
    </Suspense>
  )
}

function PinterestConnectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<PendingData | null>(null)
  const [selectedBoard, setSelectedBoard] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const raw = searchParams.get('data')
    if (!raw) { setError('No data received.'); return }
    try {
      const parsed = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')))
      setData(parsed)
      // Default select first board
      if (parsed.boards?.length > 0) setSelectedBoard(parsed.boards[0].id)
    } catch {
      setError('Failed to parse Pinterest response.')
    }
  }, [searchParams])

  const handleSave = async () => {
    if (!data || !selectedBoard) return
    setSaving(true)
    try {
      const board = data.boards.find(b => b.id === selectedBoard)!
      const tokenExpiry = data.expiresIn
        ? new Date(Date.now() + data.expiresIn * 1000).toISOString()
        : null

      const res = await fetch('/api/oauth/pinterest/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiry,
          board,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      router.push('/accounts?success=pinterest')
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  if (error) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={{ color: '#ff5f5f', textAlign: 'center', fontSize: 14 }}>{error}</p>
        <button style={{ ...s.btnPrimary, background: '#e60023', marginTop: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} onClick={() => router.push('/accounts')}>Back</button>
      </div>
    </div>
  )

  if (!data) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.spinner} />
        <p style={{ color: '#9999aa', textAlign: 'center', marginTop: 16, fontSize: 14 }}>Loading your Pinterest boards...</p>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={{ ...s.icon, background: '#e60023' }}>P</div>
          <div>
            <h2 style={s.title}>Choose a Pinterest Board</h2>
            <p style={s.sub}>Postify will publish new Pins to this board</p>
          </div>
        </div>

        <div style={s.divider} />

        <p style={{ fontSize: 12, color: '#9999aa', marginBottom: 12 }}>
          {data.boards.length} board{data.boards.length !== 1 ? 's' : ''} found — select one to post to
        </p>

        {data.boards.length === 0 ? (
          <div style={s.empty}>
            <p style={{ color: '#9999aa', fontSize: 13 }}>
              No boards found. Create a board on Pinterest first, then reconnect.
            </p>
          </div>
        ) : (
          <div style={s.boardList}>
            {data.boards.map(board => {
              const isSel = selectedBoard === board.id
              return (
                <div
                  key={board.id}
                  onClick={() => setSelectedBoard(board.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    background: isSel ? 'rgba(230,0,35,0.06)' : '#1e1e22',
                    border: `1px solid ${isSel ? 'rgba(230,0,35,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    userSelect: 'none',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e6002322', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {board.media?.image_cover_url
                      ? <img src={board.media.image_cover_url} alt={board.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ color: '#e60023', fontWeight: 700, fontSize: 16 }}>P</span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#f0f0f2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{board.name}</div>
                    <div style={{ fontSize: 11, color: '#555566', marginTop: 2 }}>
                      {board.privacy === 'PUBLIC' ? 'Public' : 'Secret'} board
                      {board.description && ` · ${board.description.substring(0, 40)}...`}
                    </div>
                  </div>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${isSel ? '#e60023' : 'rgba(255,255,255,0.2)'}`, background: isSel ? '#e60023' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isSel && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div style={s.divider} />

        <div style={s.footer}>
          <button style={s.btnSecondary} onClick={() => router.push('/accounts')}>Cancel</button>
          <button
            style={{ ...s.btnPrimary, background: '#e60023', opacity: !selectedBoard || saving ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={!selectedBoard || saving}
          >
            {saving ? 'Connecting...' : 'Connect Board'}
          </button>
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', background: '#0f0f11', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#17171a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480 },
  header: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
  icon: { width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20, fontWeight: 700, flexShrink: 0 },
  title: { fontSize: 18, fontWeight: 600, color: '#f0f0f2', margin: 0 },
  sub: { fontSize: 13, color: '#9999aa', margin: '3px 0 0' },
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '18px 0' },
  boardList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' },
  empty: { padding: 24, background: '#1e1e22', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  btnPrimary: { padding: '10px 20px', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9999aa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  spinner: { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(230,0,35,0.2)', borderTopColor: '#e60023', margin: '0 auto' },
}
