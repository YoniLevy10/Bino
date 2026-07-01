import type { Metadata, Viewport } from 'next'
import { WorkerServiceWorkerRegister } from '../components/worker/WorkerServiceWorkerRegister'

export const viewport: Viewport = {
  themeColor: '#0066FF',
}

export const metadata: Metadata = {
  title: 'אזור עובד — במקור',
  description: 'תקלות משויכות אליך — עדכון וטיפול מהיר',
  applicationName: 'במקור — אזור עובד',
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
