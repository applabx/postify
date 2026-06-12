'use client'

import { useState, useEffect } from 'react'
import { PLATFORMS } from '@/lib/platforms'

interface ScheduledPost {
  id: string
  text: string
  mediaUrls: string[]
  scheduledAt: string
  status: string
  targets: Array<{
    id: string
    status: string
    socialAccount: {
      id: string
      platform: string
      name: string
      avatarUrl?: string
    }
  }>
}

export default function QueuePage() {
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/posts?status=SCHEDULED&limit=50')
      const data = await res.json()
      setPosts(data.posts || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const cancelPost = async (postId: string) => {
    if (!confirm('Cancel this scheduled post?')) return
    setCancelling(postId)
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== postId))
        showToast('Scheduled post cancelled')
      }
    } finally {
      setCancelling(null)
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Group posts by day
  const grouped = posts.reduce((acc, post) => {
    const day = new Date(post.scheduledAt).toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    })
    if (!acc[day]) acc[day] = []
    acc[day].push(post)
    return acc
  }, {} as Record<string, ScheduledPost[]>)

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Queue</h1>
          <p style={s.sub}>
            {posts.length} post{posts.length !== 1 ? 's' : ''} scheduled
          </p>
        </div>
        <a href="/compose" style={s.btnPrimary}>+ New Post</a>
      </div>

      {loading ? (
        <div style={s.empty}>Loading scheduled posts...</div>
      ) : posts.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={s.emptyIcon}>⏱</div>
          <p style={s.emptyTitle}>No scheduled posts</p>
          <p style={s.emptySub}>Posts you schedule will appear here</p>
          <a href="/compose" style={{ ...s.btnPrimary, marginTop: 16, display: 'inline-block', textDecoration: 'none' }}>Compose a post</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {Object.entries(grouped).map(([day, dayPosts]) => (
            <div key={day}>
              <div style={s.dayLabel}>{day}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dayPosts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onCancel={() => cancelPost(post.id)}
                    cancelling={cancelling === post.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <Toast msg={toast} />}
    </div>
  )
}

function PostCard({ post, onCancel, cancelling }: {
  post: ScheduledPost
  onCancel: () => void
  cancelling: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const time = new Date(post.scheduledAt).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  })

  const platforms = [...new Set(post.targets.map(t => t.socialAccount.platform))]

  return (
    <div style={s.card}>
      <div style={s.cardTop}>
        {/* Time */}
        <div style={s.timeBlock}>
          <div style={s.timeText}>{time}</div>
          <div style={s.timeLabel}>ICT</div>
        </div>

        {/* Platform icons */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {post.targets.map(target => {
            const p = PLATFORMS[target.socialAccount.platform as keyof typeof PLATFORMS]
            if (!p) return null
            return (
              <div key={target.id} title={target.socialAccount.name} style={{ ...s.platformChip, background: p.color + '18', border: `1px solid ${p.color}30` }}>
                <span style={{ color: p.color, fontSize: 9, fontWeight: 700 }}>{p.icon}</span>
                <span style={{ color: '#555570', fontSize: 11, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {target.socialAccount.name}
                </span>
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={s.btnGhost} onClick={() => setExpanded(v => !v)}>
            {expanded ? 'Hide' : 'Preview'}
          </button>
          <button
            style={{ ...s.btnDanger, opacity: cancelling ? 0.5 : 1 }}
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? '...' : 'Cancel'}
          </button>
        </div>
      </div>

      {/* Post text preview */}
      <div style={{ ...s.textPreview, WebkitLineClamp: expanded ? undefined : 2 }}>
        {post.text}
      </div>

      {/* Media thumbnails */}
      {post.mediaUrls.length > 0 && expanded && (
        <div style={s.mediaRow}>
          {post.mediaUrls.map((url, i) => (
            <img key={i} src={url} alt="" style={s.mediaThumbnail} />
          ))}
        </div>
      )}
    </div>
  )
}

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#ffffff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#1a1a2e', zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}>
      {msg}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, minHeight: '100vh', background: '#f5f5f8', maxWidth: 860, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  h1: { fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 4px' },
  sub: { fontSize: 13, color: '#777790', margin: 0 },
  btnPrimary: { padding: '8px 16px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { padding: '5px 10px', background: 'transparent', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, color: '#555570', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  btnDanger: { padding: '5px 10px', background: 'rgba(217,64,64,0.07)', border: '1px solid rgba(217,64,64,0.22)', borderRadius: 6, color: '#d94040', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  dayLabel: { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: '#888899', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 2 },
  card: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 16 },
  cardTop: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 },
  timeBlock: { textAlign: 'center', flexShrink: 0, width: 48 },
  timeText: { fontSize: 16, fontWeight: 600, color: '#1a1a2e', fontFamily: 'monospace' },
  timeLabel: { fontSize: 10, color: '#888899', marginTop: 1 },
  platformChip: { display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 20, fontSize: 11 },
  textPreview: { fontSize: 13, color: '#555570', lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  mediaRow: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  mediaThumbnail: { width: 80, height: 80, objectFit: 'cover', borderRadius: 6 },
  empty: { color: '#777790', fontSize: 14, padding: 40, textAlign: 'center' },
  emptyCard: { textAlign: 'center', padding: '60px 24px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 16, marginTop: 20 },
  emptyIcon: { fontSize: 32, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 500, color: '#1a1a2e', margin: '0 0 6px' },
  emptySub: { fontSize: 13, color: '#777790', margin: 0 },
}
