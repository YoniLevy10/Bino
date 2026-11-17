import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import {
  computeMajorityProgress,
  countVoteChoices,
  normalizeVoteChoice,
} from '@/lib/building-governance/roles'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

/**
 * GET — building decisions for the resident's project (approvals center).
 * Includes pending / history-friendly fields + this resident's signature + vote.
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
        'id, title, body, status, majority_threshold, required_signatures, document_id, created_at, closed_at'
      )
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .in('status', ['open', 'passed', 'rejected', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(40)

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
      vote_choice: string | null
    }
    let mine: SigLite[] = []
    const allSignedByDecision = new Map<
      string,
      Array<{ status: string; vote_choice: string | null }>
    >()

    const documentIds = Array.from(
      new Set(
        rows
          .map((d) => (d as { document_id: string | null }).document_id)
          .filter((id): id is string => Boolean(id))
      )
    )
    const docsById = new Map<
      string,
      { id: string; file_name: string; mime_type: string | null; file_size: number | null }
    >()

    if (ids.length > 0) {
      const { data: mySigs } = await admin
        .from('building_signature_requests')
        .select('id, decision_id, status, signed_at, resident_id, vote_choice')
        .eq('client_id', clientId)
        .eq('resident_id', residentId)
        .in('decision_id', ids)
        .limit(50)
      mine = (mySigs ?? []) as SigLite[]

      const { data: signedRows } = await admin
        .from('building_signature_requests')
        .select('decision_id, status, vote_choice')
        .eq('client_id', clientId)
        .in('decision_id', ids)
        .eq('status', 'signed')
        .limit(500)

      for (const row of signedRows ?? []) {
        const r = row as {
          decision_id: string
          status: string
          vote_choice: string | null
        }
        const list = allSignedByDecision.get(r.decision_id) || []
        list.push({ status: r.status, vote_choice: r.vote_choice })
        allSignedByDecision.set(r.decision_id, list)
      }
    }

    if (documentIds.length > 0) {
      const { data: docs } = await admin
        .from('project_documents')
        .select('id, file_name, mime_type, file_size')
        .eq('client_id', clientId)
        .eq('project_id', projectId)
        .in('id', documentIds)
        .limit(40)
      for (const doc of docs ?? []) {
        const d = doc as {
          id: string
          file_name: string
          mime_type: string | null
          file_size: number | null
        }
        docsById.set(d.id, d)
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
        document_id: string | null
        created_at: string
        closed_at: string | null
      }
      const my = mine.find((s) => s.decision_id === row.id)
      const tallies = countVoteChoices(allSignedByDecision.get(row.id) || [])
      const progress = computeMajorityProgress({
        approveCount: tallies.approve,
        requiredSignatures: row.required_signatures,
        majorityThreshold: Number(row.majority_threshold),
      })
      const canSign = row.status === 'open' && (!my || my.status === 'pending')
      const myVote =
        my?.status === 'signed' ? normalizeVoteChoice(my.vote_choice) : null
      const document = row.document_id ? docsById.get(row.document_id) || null : null
      return {
        id: row.id,
        title: row.title,
        body: row.body,
        status: row.status,
        required_signatures: row.required_signatures,
        signed_count: tallies.signed,
        approve_count: tallies.approve,
        oppose_count: tallies.oppose,
        abstain_count: tallies.abstain,
        majority_pct: progress.pct,
        majority_reached: progress.reached,
        majority_need: progress.need,
        created_at: row.created_at,
        closed_at: row.closed_at,
        document_id: row.document_id,
        document: document
          ? {
              id: document.id,
              file_name: document.file_name,
              mime_type: document.mime_type,
              file_size: document.file_size,
            }
          : null,
        my_signature: my
          ? {
              id: my.id,
              status: my.status,
              signed_at: my.signed_at,
              vote_choice: my.status === 'signed' ? myVote : null,
            }
          : null,
        can_sign: canSign,
        section: canSign
          ? ('pending' as const)
          : my?.status === 'signed' || row.status !== 'open'
            ? ('history' as const)
            : ('status' as const),
      }
    })

    const pending = enriched.filter((d) => d.section === 'pending')
    const history = enriched.filter((d) => d.section === 'history')
    const status = enriched.filter((d) => d.section === 'status')

    return NextResponse.json({
      decisions: enriched,
      sections: {
        pending,
        history,
        status,
      },
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
