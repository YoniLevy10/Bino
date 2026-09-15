import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { MarkdownProse } from '@/app/components/legal/MarkdownProse'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description: 'מדיניות פרטיות — BINO',
  alternates: { canonical: `${origin}/privacy` },
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
      <MarkdownProse source={raw} />
    </LegalPublicShell>
  )
}
