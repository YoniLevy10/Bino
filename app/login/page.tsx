import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginClient } from './login-client'

export const metadata: Metadata = {
  title: 'כניסה',
  description: 'כניסה למערכת BINO',
  robots: { index: false, follow: false },
}

function LoginFallback() {
  return <LoginClientFallback />
}

function LoginClientFallback() {
  // Minimal fallback: avoid useSearchParams during prerender
  return (
    <div style={{ padding: '40px 16px', textAlign: 'center' }}>
      טוען…
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  )
}

