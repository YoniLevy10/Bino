import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { submitBuildingSignatureBodySchema } from '@/lib/api-body-schemas'
import { applyDecisionMajorityIfReached } from '@/lib/building-governance/apply-majority'
import { auditBuildingSignatureSign } from '@/lib/building-governance/sign-audit'
import { hashSignatureContent } from '@/lib/building-governance/signature-content'
import { getLogger } from '@/lib/shared/logging'
import { checkIpPostRouteLimit } from '@/lib/shared/rate-limit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ token: string }> }

/** Public: load decision + signer stub by token. */
export async function GET(_req: Request, ctx: Ctx) {
  const { token: rawToken } = await ctx.params
  const token = (rawToken || '').trim()
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: reqRow, error } = await admin
    .from('building_signature_requests')
    .select(
      'id, token, signer_name, signer_phone, status, signed_at, expires_at, decision_id, project_id, client_id'
    )
    .eq('token', token)
    .maybeSingle()

  if (error) {
    getLogger().error('BUILDING_GOVERNANCE', 'public sign GET failed', new Error(error.message))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
  if (!reqRow) {
    return NextResponse.json({ error: 'קישור חתימה לא נמצא' }, { status: 404 })
  }

  if (reqRow.expires_at && new Date(reqRow.expires_at).getTime() < Date.now()) {
    if (reqRow.status === 'pending') {
      await admin
        .from('building_signature_requests')
        .update({ status: 'expired' })
        .eq('id', reqRow.id)
        .eq('status', 'pending')
    }
    return NextResponse.json({ error: 'פג תוקף קישור החתימה', code: 'EXPIRED' }, { status: 410 })
  }

  const { data: decision } = await admin
    .from('building_decisions')
    .select('id, title, body, status, majority_threshold, required_signatures, project_id')
    .eq('id', reqRow.decision_id)
    .maybeSingle()

  const { data: project } = await admin
    .from('projects')
    .select('id, name, address')
    .eq('id', reqRow.project_id)
    .maybeSingle()

  return NextResponse.json({
    request: {
      id: reqRow.id,
      signer_name: reqRow.signer_name,
      signer_phone: reqRow.signer_phone,
      status: reqRow.status,
      signed_at: reqRow.signed_at,
      expires_at: reqRow.expires_at,
    },
    decision: decision
      ? {
          id: decision.id,
          title: decision.title,
          body: decision.body,
          status: decision.status,
        }
      : null,
    project: project
      ? { id: project.id, name: project.name, address: project.address }
      : null,
  })
}

/** Public: submit canvas signature data-URL. */
export async function POST(req: Request, ctx: Ctx) {
  const { token: rawToken } = await ctx.params
  const token = (rawToken || '').trim()
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const fwd = req.headers.get('x-forwarded-for') || ''
  const ip = (fwd.split(',')[0] || '').trim() || req.headers.get('x-real-ip') || 'unknown'
  const rl = await checkIpPostRouteLimit(admin, ip, 'building-sign')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = submitBuildingSignatureBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: reqRow, error } = await admin
    .from('building_signature_requests')
    .select('id, status, expires_at, decision_id, client_id, project_id, resident_id, unit_id')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    getLogger().error('BUILDING_GOVERNANCE', 'public sign POST load failed', new Error(error.message))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
  if (!reqRow) {
    return NextResponse.json({ error: 'קישור חתימה לא נמצא' }, { status: 404 })
  }

  const contentHash = hashSignatureContent(parsed.data.signature_data_url)
  const voteChoice = parsed.data.vote_choice ?? 'approve'

  if (reqRow.status === 'signed') {
    await auditBuildingSignatureSign({
      clientId: reqRow.client_id,
      decisionId: reqRow.decision_id,
      signatureRequestId: reqRow.id,
      projectId: reqRow.project_id,
      residentId: reqRow.resident_id,
      unitId: reqRow.unit_id,
      signatureDataUrl: parsed.data.signature_data_url,
      source: 'public_token',
      alreadySigned: true,
    })
    return NextResponse.json({
      ok: true,
      already_signed: true,
      content_hash: contentHash,
      vote_choice: voteChoice,
    })
  }
  if (reqRow.status !== 'pending') {
    return NextResponse.json({ error: 'לא ניתן לחתום על בקשה זו' }, { status: 400 })
  }
  if (reqRow.expires_at && new Date(reqRow.expires_at).getTime() < Date.now()) {
    await admin
      .from('building_signature_requests')
      .update({ status: 'expired' })
      .eq('id', reqRow.id)
      .neq('status', 'signed')
    return NextResponse.json({ error: 'פג תוקף קישור החתימה', code: 'EXPIRED' }, { status: 410 })
  }

  const now = new Date().toISOString()
  const { data: updated, error: upErr } = await admin
    .from('building_signature_requests')
    .update({
      status: 'signed',
      signature_data_url: parsed.data.signature_data_url,
      signature_content_hash: contentHash,
      vote_choice: voteChoice,
      signed_at: now,
      ...(parsed.data.signer_name ? { signer_name: parsed.data.signer_name } : {}),
    })
    .eq('id', reqRow.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (upErr) {
    getLogger().error('BUILDING_GOVERNANCE', 'public sign save failed', new Error(upErr.message))
    return NextResponse.json({ error: 'שמירת החתימה נכשלה' }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json({
      ok: true,
      already_signed: true,
      content_hash: contentHash,
      vote_choice: voteChoice,
    })
  }

  await auditBuildingSignatureSign({
    clientId: reqRow.client_id,
    decisionId: reqRow.decision_id,
    signatureRequestId: reqRow.id,
    projectId: reqRow.project_id,
    residentId: reqRow.resident_id,
    unitId: reqRow.unit_id,
    signatureDataUrl: parsed.data.signature_data_url,
    source: 'public_token',
  })

  await applyDecisionMajorityIfReached(admin, {
    decisionId: reqRow.decision_id,
    clientId: reqRow.client_id,
    now,
  })

  return NextResponse.json({ ok: true, content_hash: contentHash, vote_choice: voteChoice })
}
