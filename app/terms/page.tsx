import type { Metadata } from 'next'
import { readFile } from 'fs/promises'
import path from 'path'
import { LegalPublicShell, legalProseStyle } from '@/app/components/legal/LegalPublicShell'

export const metadata: Metadata = {
  title: 'תקנון | Bino',
  description: 'תקנון שימוש ושירות לתשלומי ועד וגבייה דיגיטלית',
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
      <div style={legalProseStyle}>{raw}</div>
    </LegalPublicShell>
  )
}
