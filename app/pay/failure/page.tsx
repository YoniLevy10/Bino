'use client'

import { Suspense, type CSSProperties } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

function PayFailureInner() {
  const search = useSearchParams()
  const token = (search.get('t') || '').trim()

  return (
    <main dir="rtl" style={styles.shell}>
      <div style={styles.panel}>
        <p style={styles.brand}>במקור</p>
        <h1 style={styles.title}>התשלום לא הושלם</h1>
        <p style={styles.sub}>
          ניתן לנסות שוב דרך הקישור שנשלח ב-SMS, או לפנות לוועד הבית.
        </p>
        <Link
          href={token ? `/pay/${encodeURIComponent(token)}` : '/'}
          style={styles.link}
        >
          {token ? 'חזרה לקישור התשלום' : 'חזרה'}
        </Link>
      </div>
    </main>
  )
}

export default function PayFailurePage() {
  return (
    <Suspense
      fallback={
        <main dir="rtl" style={styles.shell}>
          <p style={{ color: '#991b1b' }}>טוען…</p>
        </main>
      }
    >
      <PayFailureInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'linear-gradient(160deg, #fef2f2 0%, #fff7ed 40%, #f8fafc 100%)',
    fontFamily: 'Heebo, Arial, sans-serif',
  },
  panel: { textAlign: 'center', maxWidth: 420 },
  brand: {
    margin: '0 0 12px',
    fontSize: 14,
    letterSpacing: '0.04em',
    color: '#b91c1c',
    fontWeight: 700,
  },
  title: { margin: '0 0 12px', fontSize: 28, color: '#7f1d1d' },
  sub: { margin: '0 0 24px', fontSize: 16, color: '#991b1b', lineHeight: 1.6 },
  link: { color: '#b91c1c', fontWeight: 600, textDecoration: 'underline' },
}
