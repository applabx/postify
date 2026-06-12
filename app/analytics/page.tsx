'use client'

import { useState, useEffect } from 'react'
import { PLATFORMS } from '@/lib/platforms'

interface AnalyticsData {
  summary: {
    totalPosts: number
    publishedLast30: number
    scheduledNow: number
    successTargets: number
    failedTargets: number
    totalDestinations: number
    successRate: number
  }
  platformStats: Record<string, Array<{ platform: string; name: string; count: number }>>
  recentPosts: Array<{
    id: string
    text: string
    status: string
    publishedAt?: string
    destinations: number
    successCount: number
  }>
  chartData: Array<{ day: string; count: number }>
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, color: '#777790', fontSize: 14, background: '#f5f5f8', minHeight: '100vh' }}>Loading analytics...</div>
  if (!data) return null

  const { summary, platformStats, recentPosts, chartData } = data

  // Bar chart: find max for scaling
  const maxCount = Math.max(...chartData.map(d => d.count), 1)

  // Flatten platform stats sorted by total count
  const allPlatformRows = Object.entries(platformStats)
    .map(([platform, accounts]) => ({
      platform,
      total: accounts.reduce((s, a) => s + a.count, 0),
      accounts,
    }))
    .sort((a, b) => b.total - a.total)

  const totalAcrossAll = allPlatformRows.reduce((s, r) => s + r.total, 0)

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Analytics</h1>
          <p style={s.sub}>Last 30 days · Ho Chi Minh City time</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={s.statsGrid}>
        {[
          { label: 'Total posts', value: summary.totalPosts, sub: 'all time' },
          { label: 'Published', value: summary.publishedLast30, sub: 'last 30 days' },
          { label: 'Destinations reached', value: summary.successTargets, sub: 'last 30 days' },
          { label: 'Success rate', value: `${summary.successRate}%`, sub: `${summary.failedTargets} failed` },
          { label: 'Scheduled', value: summary.scheduledNow, sub: 'in queue now' },
        ].map(stat => (
          <div key={stat.label} style={s.statCard}>
            <div style={s.statLabel}>{stat.label}</div>
            <div style={s.statValue}>{stat.value}</div>
            <div style={s.statSub}>{stat.sub}</div>
          </div>
        ))}
      </div>

      <div style={s.twoCol}>
        {/* Bar chart - daily volume */}
        <div style={s.card}>
          <div style={s.cardLabel}>Daily posts · last 14 days</div>
          {chartData.length === 0 ? (
            <div style={s.chartEmpty}>No posts published yet</div>
          ) : (
            <div style={s.barChart}>
              {chartData.map((d, i) => (
                <div key={i} style={s.barCol}>
                  <div style={s.barLabel}>{d.count > 0 ? d.count : ''}</div>
                  <div style={{ ...s.bar, height: `${Math.round((d.count / maxCount) * 100)}%`, minHeight: d.count > 0 ? 4 : 0 }} />
                  <div style={s.barDay}>{d.day}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Platform breakdown */}
        <div style={s.card}>
          <div style={s.cardLabel}>Posts by platform · last 30 days</div>
          {allPlatformRows.length === 0 ? (
            <div style={s.chartEmpty}>No posts published yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {allPlatformRows.map(row => {
                const p = PLATFORMS[row.platform as keyof typeof PLATFORMS]
                const pct = totalAcrossAll > 0 ? Math.round((row.total / totalAcrossAll) * 100) : 0
                return (
                  <div key={row.platform}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: p ? p.color + '22' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: p?.color || '#999', flexShrink: 0 }}>
                        {p?.icon || '?'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: '#2a2a3e' }}>{p?.name || row.platform}</span>
                          <span style={{ fontSize: 12, color: '#777790', fontFamily: 'monospace' }}>{row.total} ({pct}%)</span>
                        </div>
                        <div style={{ height: 4, background: '#ededf2', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: p?.color || '#7c6eff', borderRadius: 2, transition: 'width 0.6s ease' }} />
                        </div>
                      </div>
                    </div>
                    {/* Account sub-breakdown */}
                    {row.accounts.length > 1 && (
                      <div style={{ marginLeft: 34, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {row.accounts.map(acc => (
                          <div key={acc.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: '#888899' }}>{acc.name}</span>
                            <span style={{ fontSize: 11, color: '#aaaabc', fontFamily: 'monospace' }}>{acc.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div style={s.card}>
        <div style={s.cardLabel}>Recent activity</div>
        {recentPosts.length === 0 ? (
          <div style={s.chartEmpty}>No recent posts</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentPosts.map(post => {
              const isSuccess = post.status === 'PUBLISHED'
              const isPartial = post.status === 'PARTIAL'
              const color = isSuccess ? '#3ecf8e' : isPartial ? '#f5a623' : '#ff5f5f'
              return (
                <div key={post.id} style={s.activityRow}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#2a2a3e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {post.text}
                    </div>
                    <div style={{ fontSize: 11, color: '#888899', marginTop: 2 }}>
                      {post.publishedAt
                        ? new Date(post.publishedAt).toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'
                      }
                      {' · '}
                      <span style={{ color }}>
                        {isSuccess ? `${post.successCount} destinations` : isPartial ? `${post.successCount}/${post.destinations}` : 'Failed'}
                      </span>
                    </div>
                  </div>
                  <a href="/history" style={{ fontSize: 11, color: '#888899', textDecoration: 'none' }}>View →</a>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: 24, minHeight: '100vh', background: '#f5f5f8', maxWidth: 1000, margin: '0 auto' },
  header: { marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 600, color: '#1a1a2e', margin: '0 0 4px' },
  sub: { fontSize: 13, color: '#777790', margin: 0 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 },
  statCard: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '14px 16px' },
  statLabel: { fontSize: 11, color: '#888899', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 },
  statValue: { fontSize: 26, fontWeight: 600, color: '#1a1a2e', letterSpacing: '-0.5px', fontFamily: 'monospace' },
  statSub: { fontSize: 11, color: '#aaaabc', marginTop: 3 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 },
  card: { background: '#ffffff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 18, marginBottom: 14 },
  cardLabel: { fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', color: '#888899', textTransform: 'uppercase', marginBottom: 16 },
  barChart: { display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, paddingBottom: 24, position: 'relative' },
  barCol: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: 3 },
  bar: { width: '100%', background: '#7c6eff', borderRadius: '3px 3px 0 0', transition: 'height 0.5s ease', maxWidth: 28 },
  barLabel: { fontSize: 10, color: '#777790', height: 14, fontFamily: 'monospace' },
  barDay: { fontSize: 9, color: '#aaaabc', position: 'absolute', bottom: 0, textAlign: 'center', width: '100%' },
  chartEmpty: { padding: '28px 0', textAlign: 'center', color: '#aaaabc', fontSize: 13 },
  activityRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' },
}
