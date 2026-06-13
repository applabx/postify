'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

export default function SidebarNav() {
  const pathname = usePathname()
  const { data: session } = useSession()

  if (pathname === '/login' || pathname.startsWith('/api/auth') || pathname === '/register' || pathname === '/forgot-password' || pathname === '/reset-password') {
    return null
  }

  const navItems = [
    { href: '/compose', label: 'Compose', icon: '✏' },
    { href: '/queue', label: 'Queue', icon: '⏱' },
    { href: '/history', label: 'History', icon: '📋' },
    { href: '/analytics', label: 'Analytics', icon: '📊' },
    { href: '/accounts', label: 'Accounts', icon: '⚙' },
  ]

  return (
    <aside style={{
      width: 200, minWidth: 200, background: '#ffffff',
      borderRight: '1px solid rgba(0,0,0,0.08)',
      display: 'flex', flexDirection: 'column',
      padding: '16px 8px', position: 'sticky', top: 0, height: '100vh',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 20px' }}>
        <div style={{ width: 28, height: 28, background: '#7c6eff', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'white' }}>P</div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', letterSpacing: '-0.3px' }}>Postify</span>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 10px', borderRadius: 7,
              color: active ? '#7c6eff' : '#555570',
              background: active ? 'rgba(124,110,255,0.08)' : 'transparent',
              fontSize: 13, textDecoration: 'none',
              fontWeight: active ? 500 : 400,
            }}>
              <span style={{ fontSize: 14, opacity: 0.7 }}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User info + sign out */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 12, marginTop: 4 }}>
        {session?.user && (
          <div style={{ padding: '4px 10px 10px', marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.user.name || 'User'}
            </div>
            <div style={{ fontSize: 11, color: '#9999aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.user.email}
            </div>
          </div>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 7,
            color: '#9999aa', fontSize: 12,
            background: 'none', border: 'none',
            cursor: 'pointer', width: '100%', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 13, opacity: 0.7 }}>🚪</span>
          Sign out
        </button>
      </div>
    </aside>
  )
}
