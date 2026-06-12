import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: 'rgba(0,0,0,0.06)', letterSpacing: '-4px', marginBottom: 8 }}>404</div>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', margin: '0 0 8px' }}>Page not found</h2>
        <p style={{ fontSize: 13, color: '#777790', margin: '0 0 24px' }}>This page doesn't exist.</p>
        <Link href="/compose" style={{ padding: '9px 18px', background: '#7c6eff', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
          Go to Compose
        </Link>
      </div>
    </div>
  )
}
