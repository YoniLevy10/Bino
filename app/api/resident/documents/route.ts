import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { listPublishedDocumentsForMembership } from '@/lib/resident-portal/documents'

export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response
  try {
    const documents = await listPublishedDocumentsForMembership(
      auth.ctx.admin,
      auth.ctx.membership
    )
    return NextResponse.json({ documents })
  } catch (e) {
    console.error('[resident/documents]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'טעינת מסמכים נכשלה' },
      { status: 500 }
    )
  }
}
