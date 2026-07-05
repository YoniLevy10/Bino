import { readFile } from 'fs/promises'
import path from 'path'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'מדיניות פרטיות | במקור',
}

/** Renders repo root `PRIVACY_POLICY_TEMPLATE.md` so the dashboard has a reachable URL on the deployment domain. */
export default async function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'PRIVACY_POLICY_TEMPLATE.md')
  let raw = ''
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    raw = 'מסמך מדיניות הפרטיות אינו זמין במיקום הצפוי. פנו למנהלי המערכת.'
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100vh',
        padding: '32px 24px 48px',
        maxWidth: '720px',
        margin: '0 auto',
        fontFamily: 'var(--font-heebo), system-ui, sans-serif',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        textAlign: 'right',
      }}
    >
      <nav style={{ marginBottom: '24px', fontSize: '14px' }}>
        <Link href="/settings" prefetch={false}>
          ← חזרה להגדרות
        </Link>
      </nav>
      {raw}
    </main>
  )
}
