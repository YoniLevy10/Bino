import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'
import { residentSignBuildingDecisionBodySchema } from '@/lib/api-body-schemas'
import { applyDecisionMajorityIfReached } from '@/lib/building-governance/apply-majority'
import { auditBuildingSignatureSign } from '@/lib/building-governance/sign-audit'
import { hashSignatureContent } from '@/lib/building-governance/signature-content'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * POST — authenticated resident signs an open building decision (canvas data-URL).
 * Writes building_signature_requests (resident_id / unit_id / vote_choice) and may flip → passed.
 * Duplicate votes for the same resident are blocked. Signed rows are never deleted.
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
    'resident-building-decision-sign'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = residentSignBuildingDecisionBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: decision, error: dErr } = await admin
    .from('building_decisions')
    .select('id, status, title')
    .eq('id', decisionId)
    .eq('client_id', membership.client_id)
    .eq('project_id', membership.project_id)
    .maybeSingle()

  if (dErr) {
    return NextResponse.json({ error: 'שגיאה בטעינת החלטה' }, { status: 500 })
  }
  if (!decision) {
    return NextResponse.json({ error: 'החלטה לא נמצאה' }, { status: 404 })
  }
  if (decision.status !== 'open' && decision.status !== 'draft') {
    return NextResponse.json({ error: 'ההחלטה אינה פתוחה לחתימות' }, { status: 400 })
  }

  const { data: existing } = await admin
    .from('building_signature_requests')
    .select('id, status')
    .eq('client_id', membership.client_id)
    .eq('decision_id', decisionId)
    .eq('resident_id', membership.resident_id)
    .maybeSingle()

  const contentHash = hashSignatureContent(parsed.data.signature_data_url)
  const voteChoice = parsed.data.vote_choice ?? 'approve'

  if (existing && (existing as { status: string }).status === 'signed') {
    await auditBuildingSignatureSign({
      clientId: membership.client_id,
      userId,
      decisionId,
      signatureRequestId: (existing as { id: string }).id,
      projectId: membership.project_id,
      residentId: membership.resident_id,
      unitId: membership.unit_id,
      signatureDataUrl: parsed.data.signature_data_url,
      source: 'resident_portal',
      alreadySigned: true,
    })
    return NextResponse.json({
      ok: true,
      already_signed: true,
      content_hash: contentHash,
      vote_choice: voteChoice,
    })
  }

  const now = new Date().toISOString()
  const signerName =
    (membership.resident_name || '').trim() ||
    (membership.apartment_number ? `דירה ${membership.apartment_number}` : 'דייר/ת')

  let requestId: string

  if (existing) {
    const { error: upErr } = await admin
      .from('building_signature_requests')
      .update({
        status: 'signed',
        signature_data_url: parsed.data.signature_data_url,
        signature_content_hash: contentHash,
        vote_choice: voteChoice,
        signed_at: now,
        signer_name: signerName,
        unit_id: membership.unit_id,
      })
      .eq('id', (existing as { id: string }).id)
      .eq('status', 'pending')

    if (upErr) {
      getLogger().error(
        'BUILDING_GOVERNANCE',
        'resident sign update failed',
        new Error(upErr.message),
        { clientId: membership.client_id }
      )
      return NextResponse.json({ error: 'שמירת החתימה נכשלה' }, { status: 500 })
    }
    requestId = (existing as { id: string }).id
  } else {
    const token = randomBytes(24).toString('hex')
    const { data: inserted, error: insErr } = await admin
      .from('building_signature_requests')
      .insert({
        client_id: membership.client_id,
        project_id: membership.project_id,
        decision_id: decisionId,
        token,
        signer_name: signerName,
        signer_phone: null,
        resident_id: membership.resident_id,
        unit_id: membership.unit_id,
        status: 'signed',
        signature_data_url: parsed.data.signature_data_url,
        signature_content_hash: contentHash,
        vote_choice: voteChoice,
        signed_at: now,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (insErr || !inserted) {
      if (insErr?.code === '23505' || /duplicate|unique/i.test(insErr?.message || '')) {
        return NextResponse.json({
          ok: true,
          already_signed: true,
          content_hash: contentHash,
          vote_choice: voteChoice,
        })
      }
      getLogger().error(
        'BUILDING_GOVERNANCE',
        'resident sign insert failed',
        new Error(insErr?.message || 'insert failed'),
        { clientId: membership.client_id }
      )
      return NextResponse.json({ error: 'שמירת החתימה נכשלה' }, { status: 500 })
    }
    requestId = (inserted as { id: string }).id
  }

  await auditBuildingSignatureSign({
    clientId: membership.client_id,
    userId,
    decisionId,
    signatureRequestId: requestId,
    projectId: membership.project_id,
    residentId: membership.resident_id,
    unitId: membership.unit_id,
    signatureDataUrl: parsed.data.signature_data_url,
    source: 'resident_portal',
  })

  const majority = await applyDecisionMajorityIfReached(admin, {
    decisionId,
    clientId: membership.client_id,
    now,
  })

  return NextResponse.json({
    ok: true,
    signature_request_id: requestId,
    content_hash: contentHash,
    vote_choice: voteChoice,
    decision_passed: majority.passed,
    signed_count: majority.signedCount,
    approve_count: majority.approveCount,
  })
}
