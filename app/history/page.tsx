'use client'

import { useState, useEffect, useCallback } from 'react'
import { PLATFORMS } from '@/lib/platforms'

interface PostTarget {
  id: string
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'SKIPPED'
  externalPostId?: string
  errorMessage?: string
  publishedAt?: string
  socialAccount: {
    id: string
    platform: string
    name: string
    handle?: string
    avatarUrl?: string
  }
}

interface Post {
  id: string
  text: string
  mediaUrls: string[]
  status: string
  publishedAt?: string
  scheduledAt?: string
  createdAt: string
  targets: PostTarget[]
}

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: '#3ecf8e',
  PARTIAL: '#f5a623',
  FAILED: '#ff5f5f',
  SCHEDULED: '#7c6eff',
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('ALL')

  const load = useCallback(async (pageNum: number, reset = false) => {
    setLoading(true)
    try {
      const statusParam = filter !== 'ALL' ? `&status=${filter}` : ''
      const res = await fetch(`/api/posts?limit=20&page=${pageNum}${statusParam}`)
      const data = await res.json()
      const newPosts = data.posts || []
      setPosts(prev => reset ? newPosts : [...prev, ...newPosts])
      setHasMore(newPosts.length === 20)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setPage(1)
    load(1, true)
  }, [filter])

  const loadMore = () => {
    const next = page + 1
    setPage(next)
    load(next)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    })

  const filters = ['ALL', 'PUBLISHED', 'PARTIAL', 'FAILED', 'SCHEDULED']

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Post History</h1>
          <p style={s.sub}>All posts you've created across every platform</p>
        </div>
        <a href="/compose" style={s.btnPrimary}>+ New Post</a>
      </div>

      {/* Filter tabs */}
      <div style={s.filterRow}>
        {filters.map(f => (
          <button
            key={f}
            style={{ ...s.filterBtn, ...(filter === f ? s.filterBtnActive : {}) }}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Post list */}
      {loading && posts.length === 0 ? (
        <div style={s.emptyMsg}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div style={s.emptyCard}>
          <div style={s.emptyIcon}>📋</div>
          <p style={s.emptyTitle}>No posts yet</p>
          <p style={s.emptySub}>Posts you publish will appear here</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map(post => {
              const isExpanded = expandedId === post.id
              const successCount = post.targets.filter(t => t.status === 'SUCCESS').length
              const failCount = post.targets.filter(t => t.status === 'FAILED').length
              const totalCount = post.targets.length
              const statusColor = STATUS_COLORS[post.status] || '#9999aa'

              return (
                <div key={post.id} style={s.card}>
                  {/* Top row */}
                  <div style={s.cardTop} onClick={() => setExpandedId(isExpanded ? null : post.id)}>
                    {/* Status dot + date */}
                    <div style={{ flexShrink: 0, textAlign: 'center', width: 56 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, margin: '0 auto 4px' }} />
                      <div style={{ fontSize: 10, color: '#888899' }}>
                        {post.publishedAt ? formatDate(post.publishedAt).split(',')[0] : '—'}
                      </div>
                    </div>

                    {/* Text preview */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={s.postText}>
                        {post.text.substring(0, 120)}{post.text.length > 120 ? '…' : ''}
                      </div>
                      <div style={s.postMeta}>
                        {post.publishedAt ? formatDate(post.publishedAt) : post.scheduledAt ? `Scheduled ${formatDate(post.scheduledAt)}` : formatDate(post.createdAt)}
                        {' · '}
                        <span style={{ color: statusColor }}>
                          {post.status === 'PUBLISHED' ? `Published to ${successCount}` : post.status === 'PARTIAL' ? `${successCount}/${totalCount} succeeded` : post.status === 'FAILED' ? 'Failed' : post.status.toLowerCase()}
                        </span>
                        {post.mediaUrls.length > 0 && ` · ${post.mediaUrls.length} media`}
                      </div>
                    </div>

                    {/* Platform icons summary */}
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                      {[...new Set(post.targets.map(t => t.socialAccount.platform))].slice(0, 6).map(pid => {
                        const p = PLATFORMS[pid as keyof typeof PLATFORMS]
                        if (!p) return null
                        return (
                          <div key={pid} style={{ width: 22, height: 22, borderRadius: 5, background: p.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: p.color }}>
                            {p.icon}
                          </div>
                        )
                      })}
                      <span style={{ fontSize: 10, color: '#888899', marginLeft: 4 }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={s.expanded}>
                      {/* Full text */}
                      <div style={s.fullText}>{post.text}</div>

                      {/* Media */}
                      {post.mediaUrls.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                          {post.mediaUrls.map((url, i) => (
                            <img key={i} src={url} alt="" style={{ height: 80, width: 80, objectFit: 'cover', borderRadius: 6 }} />
                          ))}
                        </div>
                      )}

                      {/* Per-target breakdown */}
                      <div style={s.targetGrid}>
                        {post.targets.map(target => {
                          const p = PLATFORMS[target.socialAccount.platform as keyof typeof PLATFORMS]
                          const isSuccess = target.status === 'SUCCESS'
                          const isFailed = target.status === 'FAILED'
                          return (
                            <div key={target.id} style={{ ...s.targetRow, borderColor: isFailed ? 'rgba(217,64,64,0.18)' : isSuccess ? 'rgba(26,158,101,0.14)' : 'rgba(0,0,0,0.07)' }}>
                              <div style={{ width: 24, height: 24, borderRadius: 6, background: p ? p.color + '22' : '#ededf2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: p?.color || '#888', flexShrink: 0 }}>
                                {p?.icon || '?'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, color: '#2a2a3e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {target.socialAccount.name}
                                </div>
                                {isFailed && target.errorMessage && (
                                  <div style={{ fontSize: 11, color: '#d94040', marginTop: 2 }}>{target.errorMessage}</div>
                                )}
                                {isSuccess && target.externalPostId && (
                                  <div style={{ fontSize: 11, color: '#888899', marginTop: 2 }}>ID: {target.externalPostId}</div>
                                )}
                              </div>
                              <div style={{ flexShrink: 0 }}>
                                {isSuccess && <span style={{ fontSize: 11, color: '#1a9e65', background: 'rgba(26,158,101,0.08)', padding: '2px 7px', borderRadius: 4 }}>✓ Published</span>}
                                {isFailed && <span style={{ fontSize: 11, color: '#d94040', background: 'rgba(217,64,64,0.08)', padding: '2px 7px', borderRadius: 4 }}>✕ Failed</span>}
                                {target.status === 'PENDING' && <span style={{ fontSize: 11, color: '#777790', background: 'rgba(0,0,0,0.05)', padding: '2px 7px', borderRadius: 4 }}>Pending</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {hasMore && (
            <button style={s.loadMore} onClick={loadMore} disabled={loading}>
              {loading ? 'Loading...' : 'Load more posts'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, minHeight: '100vh', background: '#f5f5f8', maxWidth: 860, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  h1: { fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 4px' },
  sub: { fontSize: 13, color: '#777790', margin: 0 },
  btnPrimary: { padding: '8px 16px', background: '#7c6eff', border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  filterRow: { display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' },
  filterBtn: { padding: '6px 14px', background: '#f0f0f5', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 20, color: '#777790', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  filterBtnActive: { background: 'rgba(124,110,255,0.10)', border: '1px solid rgba(124,110,255,0.35)', color: '#7c6eff' },
  card: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, overflow: 'hidden' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' },
  postText: { fontSize: 13, color: '#2a2a3e', lineHeight: 1.5, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  postMeta: { fontSize: 11, color: '#888899' },
  expanded: { padding: '0 16px 16px', borderTop: '1px solid rgba(0,0,0,0.06)' },
  fullText: { fontSize: 13, color: '#555570', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', padding: '14px 0', marginBottom: 10 },
  targetGrid: { display: 'flex', flexDirection: 'column', gap: 6 },
  targetRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: '#f5f5f8', border: '1px solid' },
  loadMore: { width: '100%', marginTop: 16, padding: '12px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: 10, color: '#555570', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  emptyMsg: { color: '#777790', fontSize: 14, padding: 40, textAlign: 'center' },
  emptyCard: { textAlign: 'center', padding: '60px 24px', background: '#ffffff', border: '1px solid rgba(0,0,0,0.07)', borderRadius: 16, marginTop: 20 },
  emptyIcon: { fontSize: 32, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: 500, color: '#1a1a2e', margin: '0 0 6px' },
  emptySub: { fontSize: 13, color: '#777790', margin: 0 },
}
