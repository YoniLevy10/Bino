import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { LegalPublicShell } from '@/app/components/legal/LegalPublicShell'
import { MarkdownProse } from '@/app/components/legal/MarkdownProse'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'תקנון',
  description: 'תקנון שימוש ושירות לתשלומי ועד וגבייה דיגיטלית — BINO',
  alternates: { canonical: `${origin}/terms` },
}

export default async function TermsPage() {
  const filePath = path.join(process.cwd(), 'TERMS_OF_SERVICE.md')
  let raw = ''
  try {
    raw = await readFile(filePath, 'utf8')
  } catch {
    raw = 'מסמך התקנון אינו זמין. פנו לעמוד יצירת הקשר.'
  }

  return (
    <LegalPublicShell>
      <MarkdownProse source={raw} />
    </LegalPublicShell>
  )
}
