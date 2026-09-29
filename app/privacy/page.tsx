import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { MarkdownProse } from '@/app/components/legal/MarkdownProse'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'מדיניות פרטיות',
  description: 'מדיניות הפרטיות של BINO — איך אנחנו אוספים, משתמשים ושומרים על מידע.',
  alternates: { canonical: `${origin}/privacy` },
  openGraph: {
    title: 'מדיניות פרטיות | BINO',
    description: 'מדיניות הפרטיות של BINO',
    url: `${origin}/privacy`,
    locale: 'he_IL',
  },
  robots: { index: true, follow: true },
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
