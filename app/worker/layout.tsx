import type { Metadata, Viewport } from 'next'
import { WorkerServiceWorkerRegister } from '../components/worker/WorkerServiceWorkerRegister'

export const viewport: Viewport = {
  themeColor: '#0066FF',
}

export const metadata: Metadata = {
  title: 'אזור עובד — Bino',
  description: 'תקלות משויכות אליך — עדכון וטיפול מהיר',
  applicationName: 'Bino — אזור עובד',
  manifest: '/manifest.worker.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'אזור עובד',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-title': 'אזור עובד',
  },
}

export default function WorkerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkerServiceWorkerRegister />
      {children}
    </>
  )
}
