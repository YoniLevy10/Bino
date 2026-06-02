import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'

export type PlatformDocSection = {
  id: string
  title: string
  category: string
  content: string
}

const DOC_CATALOG: { id: string; title: string; category: string; file: string }[] = [
  { id: 'platform', title: 'מדריך פלטפורמה', category: 'ליבה', file: 'docs/PLATFORM.md' },
  { id: 'billing-plans', title: 'תוכניות חיוב חודשיות', category: 'ליבה', file: 'docs/BILLING_PLANS.md' },
  { id: 'workspace', title: 'סביבת עבודה', category: 'פיתוח', file: 'WORKSPACE_GUIDE.md' },
  { id: 'runbooks', title: 'Runbooks תפעול', category: 'תפעול', file: 'docs/RUNBOOKS.md' },
  { id: 'checklist', title: 'צ\'קליסט שיפורים', category: 'מוצר', file: 'IMPROVEMENT_CHECKLIST.md' },
  { id: 'office-checklist', title: 'צ\'קליסט משרד ויומן', category: 'מוצר', file: 'IMPROVEMENT_CHECKLIST_OFFICE.md' },
]

async function readDocFile(relativePath: string): Promise<string> {
  const full = path.join(process.cwd(), relativePath)
  return readFile(full, 'utf8')
}

export async function GET(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const sections: PlatformDocSection[] = []
  for (const entry of DOC_CATALOG) {
    try {
      const content = await readDocFile(entry.file)
      sections.push({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        content,
      })
    } catch {
      sections.push({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        content: `_לא ניתן לטעון את ${entry.file}_`,
      })
    }
  }

  return NextResponse.json({ sections, updated_at: new Date().toISOString() })
}
