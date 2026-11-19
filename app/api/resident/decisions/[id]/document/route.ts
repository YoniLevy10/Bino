import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { createDecisionDocumentSignedUrl } from '@/lib/building-governance/decision-document'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST — short-lived signed URL for the PDF/document attached to a decision.
 * Tenant-scoped by resident membership client_id + project_id.
 */
export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  const { id: decisionIdRaw } = await ctx.params
  const decisionId = (decisionIdRaw || '').trim()
  if (!decisionId) {
    return NextResponse.json({ error: 'מזהה החלטה חסר' }, { status: 400 })
  }

  const { admin, membership, userId } = auth.ctx
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    userId,
    'resident-building-decision-document'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { data: decision, error } = await admin
    .from('building_decisions')
    .select('id, document_id, status')
    .eq('id', decisionId)
    .eq('client_id', membership.client_id)
    .eq('project_id', membership.project_id)
    .maybeSingle()

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'resident decision document load failed',
      new Error(error.message),
      { clientId: membership.client_id }
    )
    return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
  }
  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }
  const documentId = (decision as { document_id: string | null }).document_id
  if (!documentId) {
    return NextResponse.json({ error: 'אין מסמך מצורף להחלטה זו' }, { status: 404 })
  }

  try {
    const signed = await createDecisionDocumentSignedUrl(admin, {
      clientId: membership.client_id,
      projectId: membership.project_id,
      documentId,
    })
    return NextResponse.json(signed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'יצירת קישור נכשלה'
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'resident decision document signed url failed',
      e instanceof Error ? e : new Error(String(e)),
      { clientId: membership.client_id }
    )
    return NextResponse.json({ error: msg }, { status: 403 })
  }
}
