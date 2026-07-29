'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface TumblrBlog {
  name: string
  title: string
  url: string
  followers?: number
  avatar?: Array<{ url: string }>
}

interface PendingData {
  accessToken: string
  accessTokenSecret: string
  blogs: TumblrBlog[]
}

export default function TumblrConnectPage() {
  return (
    <Suspense fallback={<div style={s.wrap}>Loading Tumblr blogs...</div>}>
      <TumblrConnectContent />
    </Suspense>
  )
}

function TumblrConnectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<PendingData | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const key = searchParams.get('key')
    if (!key) { setError('No data received.'); return }
    fetch(`/api/oauth/pending?key=${key}`)
      .then(r => r.ok ? r.json() : null)
      .then(parsed => {
        if (!parsed) { setError('Tumblr session expired. Please try again.'); return }
        setData(parsed)
        if (parsed.blogs?.length > 0) setSelected(new Set([parsed.blogs[0].name]))
      })
      .catch(() => setError('Failed to load Tumblr data.'))
  }, [searchParams])

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const handleSave = async () => {
    if (!data || selected.size === 0) return
    setSaving(true)
    try {
      const key = searchParams.get('key')
      const selectedBlogs = data.blogs.filter(b => selected.has(b.name))
      const res = await fetch('/api/oauth/tumblr/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, selectedBlogs }),
      })
      if (!res.ok) throw new Error('Save failed')
      router.push('/accounts?success=tumblr')
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  if (error) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <p style={{ color: '#ff5f5f', textAlign: 'center', fontSize: 14 }}>{error}</p>
        <button style={{ ...s.btn, marginTop: 16, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} onClick={() => router.push('/accounts')}>Back</button>
      </div>
    </div>
  )

  if (!data) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.spinner} />
        <p style={{ color: '#9999aa', textAlign: 'center', marginTop: 16, fontSize: 14 }}>Loading your Tumblr blogs...</p>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.icon}>t</div>
          <div>
            <h2 style={s.title}>Connect Tumblr Blogs</h2>
            <p style={s.sub}>{data.blogs.length} blog{data.blogs.length !== 1 ? 's' : ''} found on your account</p>
          </div>
        </div>

        <div style={s.divider} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: '#9999aa' }}>Select which blogs to post to</span>
          <button style={s.btnLink} onClick={() =>
            selected.size === data.blogs.length
              ? setSelected(new Set())
              : setSelected(new Set(data.blogs.map(b => b.name)))
          }>
            {selected.size === data.blogs.length ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div style={s.blogList}>
          {data.blogs.map((blog, i) => {
            const isSel = selected.has(blog.name)
            const avatarUrl = blog.avatar?.[0]?.url
            return (
              <div
                key={blog.name}
                onClick={() => toggle(blog.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: isSel ? 'rgba(53,70,92,0.3)' : '#1e1e22',
                  border: `1px solid ${isSel ? 'rgba(53,70,92,0.8)' : 'rgba(255,255,255,0.07)'}`,
                  userSelect: 'none',
                }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#35465c', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {avatarUrl
                    ? <img src={avatarUrl} alt={blog.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: '#a0b0c0', fontWeight: 700, fontSize: 14 }}>{blog.title?.charAt(0) || 't'}</span>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#f0f0f2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {blog.title || blog.name}
                    {i === 0 && <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(124,110,255,0.15)', color: '#7c6eff', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>PRIMARY</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#555566', marginTop: 2 }}>
                    {blog.name}.tumblr.com
                    {blog.followers !== undefined && ` · ${blog.followers.toLocaleString()} followers`}
                  </div>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: `1.5px solid ${isSel ? '#7c6eff' : 'rgba(255,255,255,0.2)'}`, background: isSel ? '#7c6eff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={s.divider} />

        <div style={s.footer}>
          <button style={s.btnSecondary} onClick={() => router.push('/accounts')}>Cancel</button>
          <button
            style={{ ...s.btn, opacity: selected.size === 0 || saving ? 0.5 : 1 }}
            onClick={handleSave}
            disabled={selected.size === 0 || saving}
          >
            {saving ? 'Connecting...' : `Connect ${selected.size} Blog${selected.size !== 1 ? 's' : ''}`}
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
  icon: { width: 44, height: 44, background: '#35465c', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 22, fontWeight: 700, flexShrink: 0 },
  title: { fontSize: 18, fontWeight: 600, color: '#f0f0f2', margin: 0 },
  sub: { fontSize: 13, color: '#9999aa', margin: '3px 0 0' },
  divider: { height: 1, background: 'rgba(255,255,255,0.07)', margin: '18px 0' },
  blogList: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  btn: { padding: '10px 20px', background: '#35465c', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#9999aa', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  btnLink: { background: 'none', border: 'none', color: '#7c6eff', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  spinner: { width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(53,70,92,0.3)', borderTopColor: '#35465c', margin: '0 auto' },
}
