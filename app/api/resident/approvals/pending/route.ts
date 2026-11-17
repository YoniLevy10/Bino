import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { loadPendingResidentApprovalsCount } from '@/lib/building-governance/pending-approvals'

export const dynamic = 'force-dynamic'

/**
 * GET — bounded pending signature count for the active resident + building.
 */
export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  try {
    const { membership } = auth.ctx
    const count = await loadPendingResidentApprovalsCount(auth.ctx.admin, {
      clientId: membership.client_id,
      projectId: membership.project_id,
      residentId: membership.resident_id,
    })
    return NextResponse.json({ pendingApprovals: count })
  } catch (e) {
    console.error('[resident/approvals/pending]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'טעינת אישורים נכשלה' },
      { status: 500 }
    )
  }
}
