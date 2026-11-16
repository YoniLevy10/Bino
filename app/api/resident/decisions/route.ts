import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { computeMajorityProgress } from '@/lib/building-governance/roles'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

/**
 * GET — open (and recently passed) building decisions for the resident's project,
 * with this resident's signature status.
 */
export async function GET(req: Request) {
  const auth = await requireResidentContext({ request: req, allowPicker: true })
  if (!auth.ok) return auth.response

  const { admin, membership } = auth.ctx
  const { client_id: clientId, project_id: projectId, resident_id: residentId } =
    membership

  try {
    const { data: decisions, error } = await admin
      .from('building_decisions')
      .select(
        'id, title, body, status, majority_threshold, required_signatures, created_at, closed_at'
      )
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .in('status', ['open', 'passed'])
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      getLogger().error(
        'BUILDING_GOVERNANCE',
        'resident decisions list failed',
        new Error(error.message),
        { clientId }
      )
      return NextResponse.json({ error: 'טעינת החלטות נכשלה' }, { status: 500 })
    }

    const rows = decisions ?? []
    const ids = rows.map((d) => (d as { id: string }).id)
    type SigLite = {
      id: string
      decision_id: string
      status: string
      signed_at: string | null
      resident_id: string | null
    }
    let mine: SigLite[] = []
    const allSignedCounts = new Map<string, number>()

    if (ids.length > 0) {
      const { data: mySigs } = await admin
        .from('building_signature_requests')
        .select('id, decision_id, status, signed_at, resident_id')
        .eq('client_id', clientId)
        .eq('resident_id', residentId)
        .in('decision_id', ids)
        .limit(50)
      mine = (mySigs ?? []) as SigLite[]

      const { data: signedRows } = await admin
        .from('building_signature_requests')
        .select('decision_id')
        .eq('client_id', clientId)
        .in('decision_id', ids)
        .eq('status', 'signed')
        .limit(500)

      for (const row of signedRows ?? []) {
        const did = (row as { decision_id: string }).decision_id
        allSignedCounts.set(did, (allSignedCounts.get(did) || 0) + 1)
      }
    }

    const enriched = rows.map((d) => {
      const row = d as {
        id: string
        title: string
        body: string | null
        status: string
        majority_threshold: number
        required_signatures: number
        created_at: string
        closed_at: string | null
      }
      const my = mine.find((s) => s.decision_id === row.id)
      const signedCount = allSignedCounts.get(row.id) || 0
      const progress = computeMajorityProgress({
        signedCount,
        requiredSignatures: row.required_signatures,
        majorityThreshold: Number(row.majority_threshold),
      })
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        required_signatures: row.required_signatures,
        signed_count: signedCount,
        majority_pct: progress.pct,
        majority_reached: progress.reached,
        created_at: row.created_at,
        closed_at: row.closed_at,
        my_signature: my
          ? {
              id: my.id,
              status: my.status,
              signed_at: my.signed_at,
            }
          : null,
        can_sign: row.status === 'open' && (!my || my.status === 'pending'),
      }
    })

    return NextResponse.json({
      decisions: enriched,
      project: {
        id: projectId,
        name: membership.project_name,
      },
      resident: {
        id: residentId,
        name: membership.resident_name,
        apartment_number: membership.apartment_number,
      },
    })
  } catch (e) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'resident decisions GET crashed',
      e instanceof Error ? e : new Error(String(e)),
      { clientId }
    )
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
