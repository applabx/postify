'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function SidebarNav() {
  const pathname = usePathname()

  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
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
        {navItems.map(item => (
          <a key={item.href} href={item.href} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '8px 10px', borderRadius: 7,
            color: '#555570', fontSize: 13, textDecoration: 'none',
          }}>
            <span style={{ fontSize: 14, opacity: 0.7 }}>{item.icon}</span>
            {item.label}
          </a>
        ))}
      </nav>
      <Link href="/api/auth/signout" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 7,
        color: '#9999aa', fontSize: 12, textDecoration: 'none',
      }}>Sign out</Link>
    </aside>
  )
}
