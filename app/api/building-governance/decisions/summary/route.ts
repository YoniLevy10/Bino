import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  requireSessionClientId,
  requireSessionWriteAccess,
} from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { attachBuildingDecisionDocumentBodySchema } from '@/lib/api-body-schemas'
import { assertProjectForClient } from '@/lib/building-governance/project-guard'
import { buildDecisionSummaryPayload } from '@/lib/building-governance/decision-summary'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

const DOC_BUCKET = 'project-documents' as const

const DECISION_SELECT_FULL =
  'id, project_id, title, body, status, majority_threshold, required_signatures, created_at, closed_at, document_id'

const DECISION_SELECT_BASE =
  'id, project_id, title, body, status, majority_threshold, required_signatures, created_at, closed_at'

const SIG_SELECT_FULL =
  'id, signer_name, signer_phone, resident_id, status, vote_choice, signed_at, created_at'

const SIG_SELECT_BASE =
  'id, signer_name, signer_phone, resident_id, status, signed_at, created_at'

type DecisionRow = {
  id: string
  project_id: string
  title: string
  body: string | null
  status: string
  majority_threshold: number
  required_signatures: number
  created_at: string
  closed_at: string | null
  document_id?: string | null
}

/**
 * GET — decision summary for manager/vaad: votes, threshold %, signers, PDF, audit refs.
 */
export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim()
  const decisionId = url.searchParams.get('decision_id')?.trim()
  if (!projectId || !decisionId) {
    return NextResponse.json({ error: 'project_id ו־decision_id נדרשים' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const gate = await assertProjectForClient(admin, projectId, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let decision: DecisionRow | null = null
  {
    const full = await admin
      .from('building_decisions')
      .select(DECISION_SELECT_FULL)
      .eq('id', decisionId)
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (full.error && /document_id|column/i.test(full.error.message)) {
      const base = await admin
        .from('building_decisions')
        .select(DECISION_SELECT_BASE)
        .eq('id', decisionId)
        .eq('client_id', auth.ctx.clientId)
        .eq('project_id', projectId)
        .maybeSingle()
      if (base.error) {
        return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
      }
      decision = base.data as DecisionRow | null
    } else if (full.error) {
      return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
    } else {
      decision = full.data as DecisionRow | null
    }
  }

  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }

  let sigs: Array<{
    id: string
    signer_name: string
    signer_phone: string | null
    resident_id: string | null
    status: string
    vote_choice?: string | null
    signed_at: string | null
    created_at: string
  }> = []

  {
    const full = await admin
      .from('building_signature_requests')
      .select(SIG_SELECT_FULL)
      .eq('client_id', auth.ctx.clientId)
      .eq('decision_id', decisionId)
      .order('created_at', { ascending: true })
      .limit(500)
    if (full.error && /vote_choice|column/i.test(full.error.message)) {
      const base = await admin
        .from('building_signature_requests')
        .select(SIG_SELECT_BASE)
        .eq('client_id', auth.ctx.clientId)
        .eq('decision_id', decisionId)
        .order('created_at', { ascending: true })
        .limit(500)
      if (base.error) {
        return NextResponse.json({ error: 'שגיאה בטעינת חתימות' }, { status: 500 })
      }
      sigs = (base.data ?? []) as typeof sigs
    } else if (full.error) {
      return NextResponse.json({ error: 'שגיאה בטעינת חתימות' }, { status: 500 })
    } else {
      sigs = (full.data ?? []) as typeof sigs
    }
  }

  const { data: project } = await admin
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  let pdf: {
    document_id: string | null
    file_name: string | null
    download_url: string | null
  } = {
    document_id: decision.document_id ?? null,
    file_name: null,
    download_url: null,
  }

  if (decision.document_id) {
    const { data: doc } = await admin
      .from('project_documents')
      .select('id, file_name, storage_path')
      .eq('id', decision.document_id)
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', projectId)
      .maybeSingle()
    if (doc) {
      const row = doc as { id: string; file_name: string; storage_path: string }
      const { data: signed } = await admin.storage
        .from(DOC_BUCKET)
        .createSignedUrl(row.storage_path, 3600)
      pdf = {
        document_id: row.id,
        file_name: row.file_name,
        download_url: signed?.signedUrl ?? null,
      }
    }
  }

  const { data: auditRows, error: auditErr } = await admin
    .from('audit_log')
    .select('id, action, created_at, user_id')
    .eq('client_id', auth.ctx.clientId)
    .eq('entity_type', 'building_decision')
    .eq('entity_id', decisionId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (auditErr) {
    getLogger().warn('BUILDING_GOVERNANCE', 'decision summary audit failed', {
      err: auditErr.message,
      clientId: auth.ctx.clientId,
    })
  }

  const summary = buildDecisionSummaryPayload({
    decision,
    projectName: (project as { name?: string } | null)?.name || 'בניין',
    signatures: sigs,
    auditRefs: ((auditRows ?? []) as Array<{
      id: string
      action: string
      created_at: string
      user_id: string | null
    }>).map((a) => ({
      id: a.id,
      action: a.action,
      created_at: a.created_at,
      user_id: a.user_id,
    })),
    pdf,
  })

  return NextResponse.json({ summary })
}

/**
 * POST — attach / clear project document on a decision (PDF link for summary).
 */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = attachBuildingDecisionDocumentBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-decision-doc'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: decision, error: dErr } = await admin
    .from('building_decisions')
    .select('id')
    .eq('id', body.decision_id)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .maybeSingle()

  if (dErr) {
    if (/document_id|column/i.test(dErr.message)) {
      return NextResponse.json(
        { error: 'יש להחיל מיגרציה 141 / PR-H (document_id) לפני צירוף PDF' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
  }
  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }

  if (body.document_id) {
    const { data: doc } = await admin
      .from('project_documents')
      .select('id')
      .eq('id', body.document_id)
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', body.project_id)
      .maybeSingle()
    if (!doc) {
      return NextResponse.json({ error: 'מסמך לא נמצא בפרויקט' }, { status: 404 })
    }
  }

  const { error: upErr } = await admin
    .from('building_decisions')
    .update({
      document_id: body.document_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.decision_id)
    .eq('client_id', auth.ctx.clientId)

  if (upErr) {
    if (/document_id|column/i.test(upErr.message)) {
      return NextResponse.json(
        { error: 'יש להחיל מיגרציה 141 / PR-H (document_id) לפני צירוף PDF' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'עדכון מסמך נכשל' }, { status: 500 })
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'building_decision_document_attached',
    entityType: 'building_decision',
    entityId: body.decision_id,
    newValues: { document_id: body.document_id },
  })

  return NextResponse.json({ ok: true, document_id: body.document_id })
}
