import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { createResidentDocumentSignedUrl } from '@/lib/resident-portal/documents'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireResidentContext({ request: req })
  if (!auth.ok) return auth.response
  const { id } = await ctx.params
  try {
    const signed = await createResidentDocumentSignedUrl(
      auth.ctx.admin,
      auth.ctx.membership,
      id
    )
    return NextResponse.json(signed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'יצירת קישור נכשלה'
    console.error('[resident/documents/signed-url]', msg)
    return NextResponse.json({ error: msg }, { status: 403 })
  }
}
