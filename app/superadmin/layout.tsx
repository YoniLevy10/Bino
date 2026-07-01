import type { Metadata, Viewport } from 'next'
import './superadmin.css'

export const viewport: Viewport = {
  themeColor: '#0066FF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Super Admin — במקור',
  description: 'ניהול לקוחות, חבילות, מכסות ותוספים',
  applicationName: 'במקור Super Admin',
  manifest: '/manifest.superadmin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Super Admin',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'Super Admin',
    'mobile-web-app-capable': 'yes',
  },
}

export default function SuperadminLayout({ children }: { children: React.ReactNode }) {
  return <div className="sa-root">{children}</div>
}
