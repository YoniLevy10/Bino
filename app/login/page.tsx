import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginClient } from './login-client'
import styles from './login.module.css'

export const metadata: Metadata = {
  title: 'כניסה',
  description: 'כניסה למערכת BINO',
  robots: { index: false, follow: false },
}

function LoginFallback() {
  return (
    <main className={styles.page} aria-busy="true">
      <div className={styles.loadingShell} role="status">
        <span className={styles.loadingMark} aria-hidden="true">B</span>
        <p>טוען את סביבת הכניסה…</p>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  )
}

