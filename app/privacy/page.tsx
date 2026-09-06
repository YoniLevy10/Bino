import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { LegalPublicShell, legalProseStyle } from '@/app/components/legal/LegalPublicShell'

export const metadata: Metadata = {
  title: 'מדיניות פרטיות | Bino',
  description: 'מדיניות פרטיות — Bino',
}

/** Renders repo root `PRIVACY_POLICY_TEMPLATE.md` — public for Grow / residents. */
export default async function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'PRIVACY_POLICY_TEMPLATE.md')
  let raw = ''
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    raw = 'מסמך מדיניות הפרטיות אינו זמין במיקום הצפוי. פנו לעמוד יצירת הקשר.'
  }

  return (
    <LegalPublicShell>
      <div style={legalProseStyle}>{raw}</div>
    </LegalPublicShell>
  )
}
