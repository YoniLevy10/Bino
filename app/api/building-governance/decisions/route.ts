import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  requireSessionClientId,
  requireSessionWriteAccess,
} from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import {
  createBuildingDecisionBodySchema,
  createSignatureRequestBodySchema,
  updateBuildingDecisionBodySchema,
} from '@/lib/api-body-schemas'
import { assertProjectForClient } from '@/lib/building-governance/project-guard'
import {
  dedupeResidentBoundSignedRows,
  loadEligibleVoterCount,
} from '@/lib/building-governance/eligible-voters'
import {
  buildingSignPublicPath,
  computeMajorityProgress,
  countVoteChoices,
} from '@/lib/building-governance/roles'
import { getLogger } from '@/lib/shared/logging'

export const dynamic = 'force-dynamic'

const DECISION_SELECT =
  'id, project_id, title, body, status, majority_threshold, required_signatures, created_at, closed_at'

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
}

type SigRow = {
  decision_id: string
  status: string
  id: string
  token: string
  signer_name: string
  signer_phone: string | null
  resident_id: string | null
  unit_id: string | null
  vote_choice: string | null
  signed_at: string | null
  created_at: string
}

type RecipientRow = {
  id: string
  decision_id: string
  resident_id: string
  signature_request_id: string | null
  channels: string[] | null
  sms_status: string
  email_status: string
  portal_path: string | null
  created_at: string
}

/** List decisions + signature progress for a project. */
export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const gate = await assertProjectForClient(admin, projectId, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: decisions, error } = await admin
    .from('building_decisions')
    .select(DECISION_SELECT)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'decisions list failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בטעינת החלטות' }, { status: 500 })
  }

  const rows = (decisions ?? []) as DecisionRow[]
  const ids = rows.map((d) => d.id)
  let sigs: SigRow[] = []
  let recipients: RecipientRow[] = []
  if (ids.length > 0) {
    const { data: sigData, error: sigErr } = await admin
      .from('building_signature_requests')
      .select(
        'id, decision_id, token, signer_name, signer_phone, resident_id, unit_id, status, signed_at, created_at, vote_choice'
      )
      .eq('client_id', auth.ctx.clientId)
      .in('decision_id', ids)
      .order('created_at', { ascending: true })
      .limit(500)

    if (sigErr) {
      getLogger().error(
        'BUILDING_GOVERNANCE',
        'signature list failed',
        new Error(sigErr.message),
        { clientId: auth.ctx.clientId }
      )
      return NextResponse.json({ error: 'שגיאה בטעינת חתימות' }, { status: 500 })
    }
    sigs = (sigData ?? []) as SigRow[]

    const { data: recipData, error: recipErr } = await admin
      .from('building_decision_recipients')
      .select(
        'id, decision_id, resident_id, signature_request_id, channels, sms_status, email_status, portal_path, created_at'
      )
      .eq('client_id', auth.ctx.clientId)
      .in('decision_id', ids)
      .order('created_at', { ascending: true })
      .limit(500)

    if (recipErr) {
      // Soft-fail if migration not applied yet — decisions + signatures still work.
      getLogger().warn('BUILDING_GOVERNANCE', 'recipients list failed', {
        err: recipErr.message,
        clientId: auth.ctx.clientId,
      })
    } else {
      recipients = (recipData ?? []) as RecipientRow[]
    }
  }

  // Bound name lookup for recipient ledger (max 500 already).
  const residentIds = Array.from(new Set(recipients.map((r) => r.resident_id).filter(Boolean)))
  const residentById = new Map<
    string,
    { full_name: string; phone: string | null; apartment_number: string | null }
  >()
  if (residentIds.length > 0) {
    const { data: residentRows, error: resErr } = await admin
      .from('residents')
      .select('id, full_name, phone, apartment_number')
      .eq('client_id', auth.ctx.clientId)
      .in('id', residentIds)
      .limit(500)
    if (resErr) {
      getLogger().warn('BUILDING_GOVERNANCE', 'recipient resident names failed', {
        err: resErr.message,
        clientId: auth.ctx.clientId,
      })
    } else {
      for (const row of residentRows ?? []) {
        const r = row as {
          id: string
          full_name: string
          phone: string | null
          apartment_number: string | null
        }
        residentById.set(r.id, {
          full_name: r.full_name,
          phone: r.phone,
          apartment_number: r.apartment_number,
        })
      }
    }
  }

  const sigById = new Map(sigs.map((s) => [s.id, s]))
  const sigByResidentDecision = new Map(
    sigs
      .filter((s) => s.resident_id)
      .map((s) => [`${s.decision_id}:${s.resident_id}`, s] as const)
  )

  let eligible: {
    eligibleCount: number
    unitCount: number
    mappedResidentCount: number
  } = { eligibleCount: 0, unitCount: 0, mappedResidentCount: 0 }
  try {
    eligible = await loadEligibleVoterCount(admin, {
      clientId: auth.ctx.clientId,
      projectId,
    })
  } catch (e) {
    getLogger().warn('BUILDING_GOVERNANCE', 'eligible voters load failed', {
      err: e instanceof Error ? e.message : String(e),
      clientId: auth.ctx.clientId,
    })
  }

  const enriched = rows.map((d) => {
    const related = sigs.filter((s) => s.decision_id === d.id)
    const relatedRecipients = recipients.filter((r) => r.decision_id === d.id)
    const uniqueResident = dedupeResidentBoundSignedRows(related)
    const tallies = countVoteChoices(uniqueResident)
    const progress = computeMajorityProgress({
      approveCount: tallies.approve,
      requiredSignatures: d.required_signatures,
      majorityThreshold: Number(d.majority_threshold),
    })
    return {
      ...d,
      majority_threshold: Number(d.majority_threshold),
      signed_count: tallies.signed,
      approve_count: tallies.approve,
      oppose_count: tallies.oppose,
      abstain_count: tallies.abstain,
      majority_reached: progress.reached,
      majority_pct: progress.pct,
      majority_need: progress.need,
      signature_requests: related.map((s) => ({
        id: s.id,
        signer_name: s.signer_name,
        signer_phone: s.signer_phone,
        resident_id: s.resident_id,
        status: s.status,
        vote_choice: s.vote_choice,
        signed_at: s.signed_at,
        created_at: s.created_at,
        // Relative path — client prefixes origin (localhost OK on private server).
        sign_path: buildingSignPublicPath(s.token),
      })),
      recipients: relatedRecipients.map((r) => {
        const lite = residentById.get(r.resident_id)
        const linked =
          (r.signature_request_id ? sigById.get(r.signature_request_id) : undefined) ||
          sigByResidentDecision.get(`${r.decision_id}:${r.resident_id}`)
        return {
          id: r.id,
          resident_id: r.resident_id,
          resident_name: lite?.full_name ?? null,
          apartment_number: lite?.apartment_number ?? null,
          phone: lite?.phone ?? null,
          signature_request_id: r.signature_request_id,
          sign_status: linked?.status ?? 'pending',
          signed_at: linked?.signed_at ?? null,
          channels: r.channels || [],
          sms_status: r.sms_status,
          email_status: r.email_status,
          portal_path: r.portal_path,
          created_at: r.created_at,
        }
      }),
    }
  })

  return NextResponse.json({
    decisions: enriched,
    eligible_voters: {
      count: eligible.eligibleCount,
      unit_count: eligible.unitCount,
      mapped_resident_count: eligible.mappedResidentCount,
      basis: 'project_units_with_mapped_resident',
    },
  })
}

/** Create a decision (default status: open). */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = createBuildingDecisionBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-decision'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let eligibleCount = 0
  let eligibleWarning: string | null = null
  try {
    const eligible = await loadEligibleVoterCount(admin, {
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
    })
    eligibleCount = eligible.eligibleCount
  } catch (e) {
    getLogger().warn('BUILDING_GOVERNANCE', 'eligible voters on create failed', {
      err: e instanceof Error ? e.message : String(e),
      clientId: auth.ctx.clientId,
    })
  }

  // Prefer live eligible unit count as denominator when available; else manual + warn.
  let requiredSignatures: number
  if (eligibleCount > 0) {
    requiredSignatures = Math.min(500, Math.max(1, eligibleCount))
  } else if (body.required_signatures != null) {
    requiredSignatures = body.required_signatures
    eligibleWarning =
      'לא נמצאו דירות עם דייר ממופה — נעשה שימוש במספר החתימות הידני. מומלץ לקשר דיירים לדירות.'
  } else {
    requiredSignatures = 1
    eligibleWarning =
      'לא נמצאו דירות עם דייר ממופה — יש להזין ידנית את מספר החתימות הנדרש.'
  }

  const majorityThreshold = body.majority_threshold ?? 0.5
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('building_decisions')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: body.project_id,
      title: body.title,
      body: body.body ?? null,
      status: body.status ?? 'open',
      majority_threshold: majorityThreshold,
      required_signatures: requiredSignatures,
      created_by: auth.ctx.userId,
      created_at: now,
      updated_at: now,
    })
    .select(DECISION_SELECT)
    .single()

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'decision create failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'יצירת החלטה נכשלה' }, { status: 500 })
  }

  const status = (data as DecisionRow).status
  const shouldFanout =
    body.fanout_committee !== false && (status === 'open' || body.fanout_committee === true)

  let fanout: { created: number; notified: number } | null = null
  if (shouldFanout && data) {
    try {
      const { fanoutSignatureRequestsToCommittee } = await import(
        '@/lib/building-governance/signature-link-notify'
      )
      fanout = await fanoutSignatureRequestsToCommittee(admin, {
        clientId: auth.ctx.clientId,
        projectId: body.project_id,
        decisionId: (data as DecisionRow).id,
        decisionTitle: (data as DecisionRow).title,
        userId: auth.ctx.userId,
      })
    } catch (e) {
      getLogger().warn('BUILDING_GOVERNANCE', 'decision fanout failed', {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json(
    {
      decision: data,
      fanout,
      eligible_count: eligibleCount,
      eligible_warning: eligibleWarning,
    },
    { status: 201 }
  )
}

/** Create a signature request link for an existing decision. */
export async function PUT(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = createSignatureRequestBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-sign-req'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: decision, error: dErr } = await admin
    .from('building_decisions')
    .select('id, status, title')
    .eq('id', body.decision_id)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .maybeSingle()

  if (dErr) {
    return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
  }
  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }
  if (decision.status !== 'open' && decision.status !== 'draft') {
    return NextResponse.json({ error: 'לא ניתן להוסיף חתימות להחלטה סגורה' }, { status: 400 })
  }

  // Block obvious duplicate name stubs (majority only counts resident_id votes anyway).
  const normalizedName = body.signer_name.trim().toLowerCase()
  const { data: existingStubs } = await admin
    .from('building_signature_requests')
    .select('id, signer_name, signer_phone, status')
    .eq('client_id', auth.ctx.clientId)
    .eq('decision_id', body.decision_id)
    .in('status', ['pending', 'signed'])
    .limit(100)

  const dup = (existingStubs ?? []).find((s) => {
    const row = s as { signer_name: string; signer_phone: string | null }
    const sameName = (row.signer_name || '').trim().toLowerCase() === normalizedName
    if (!sameName) return false
    const phone = (body.signer_phone || '').trim()
    const existingPhone = (row.signer_phone || '').trim()
    if (phone && existingPhone) return phone === existingPhone
    return true
  })
  if (dup) {
    return NextResponse.json(
      { error: 'קיים כבר קישור חתימה לאותו חותם בהחלטה זו', code: 'DUPLICATE_SIGNER' },
      { status: 409 }
    )
  }

  const token = randomBytes(24).toString('hex')
  const days = body.expires_in_days ?? 14
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('building_signature_requests')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: body.project_id,
      decision_id: body.decision_id,
      token,
      signer_name: body.signer_name,
      signer_phone: body.signer_phone ?? null,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id, token, signer_name, signer_phone, status, created_at, expires_at')
    .single()

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'signature request create failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'יצירת קישור חתימה נכשלה' }, { status: 500 })
  }

  if (decision.status === 'draft') {
    await admin
      .from('building_decisions')
      .update({ status: 'open', updated_at: new Date().toISOString() })
      .eq('id', body.decision_id)
      .eq('client_id', auth.ctx.clientId)
  }

  let notify: { sent: boolean; sms: boolean; whatsapp: boolean; waMetaBlocked?: boolean } | null =
    null
  if (body.send_notify !== false && body.signer_phone) {
    try {
      const { notifySignatureLink } = await import(
        '@/lib/building-governance/signature-link-notify'
      )
      notify = await notifySignatureLink(admin, {
        clientId: auth.ctx.clientId,
        projectId: body.project_id,
        decisionId: body.decision_id,
        decisionTitle: (decision as { title?: string }).title || body.signer_name,
        signerName: body.signer_name,
        signerPhone: body.signer_phone,
        token,
        signatureRequestId: (data as { id: string }).id,
        userId: auth.ctx.userId,
      })
    } catch (e) {
      getLogger().warn('BUILDING_GOVERNANCE', 'signature notify failed', {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const signPath = buildingSignPublicPath(token)
  return NextResponse.json(
    {
      signature_request: { ...data, sign_path: signPath },
      sign_path: signPath,
      notify,
    },
    { status: 201 }
  )
}

/** Update open/draft decision fields (threshold, title, optional manual required). */
export async function PATCH(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = updateBuildingDecisionBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-governance-decision-patch'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const gate = await assertProjectForClient(admin, body.project_id, auth.ctx.clientId)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data: decision, error: dErr } = await admin
    .from('building_decisions')
    .select(DECISION_SELECT)
    .eq('id', body.decision_id)
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .maybeSingle()

  if (dErr) {
    return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
  }
  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }
  const row = decision as DecisionRow
  if (row.status !== 'open' && row.status !== 'draft') {
    return NextResponse.json({ error: 'לא ניתן לערוך החלטה סגורה' }, { status: 400 })
  }

  let eligibleCount = 0
  try {
    const eligible = await loadEligibleVoterCount(admin, {
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
    })
    eligibleCount = eligible.eligibleCount
  } catch (e) {
    getLogger().warn('BUILDING_GOVERNANCE', 'eligible voters on patch failed', {
      err: e instanceof Error ? e.message : String(e),
    })
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (body.title !== undefined) patch.title = body.title
  if (body.body !== undefined) patch.body = body.body
  if (body.majority_threshold !== undefined) patch.majority_threshold = body.majority_threshold

  let eligibleWarning: string | null = null
  if (eligibleCount > 0) {
    patch.required_signatures = Math.min(500, Math.max(1, eligibleCount))
  } else if (body.required_signatures !== undefined) {
    patch.required_signatures = body.required_signatures
    eligibleWarning =
      'לא נמצאו דירות עם דייר ממופה — נעשה שימוש במספר החתימות הידני.'
  }

  const { data: updated, error } = await admin
    .from('building_decisions')
    .update(patch)
    .eq('id', body.decision_id)
    .eq('client_id', auth.ctx.clientId)
    .in('status', ['open', 'draft'])
    .select(DECISION_SELECT)
    .maybeSingle()

  if (error) {
    getLogger().error(
      'BUILDING_GOVERNANCE',
      'decision patch failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'עדכון החלטה נכשל' }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({ error: 'החלטה לא נמצאה או סגורה' }, { status: 404 })
  }

  return NextResponse.json({
    decision: updated,
    eligible_count: eligibleCount,
    eligible_warning: eligibleWarning,
  })
}
