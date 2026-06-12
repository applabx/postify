import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'
import SidebarNav from './sidebar-nav'

export const metadata: Metadata = {
  title: 'Postify',
  description: 'Cross-post to all your social media platforms at once',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f5f5f8' }}>
        <Providers>
          <div style={{ display: 'flex', minHeight: '100vh' }}>
            <SidebarNav />
            <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
