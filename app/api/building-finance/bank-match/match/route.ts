import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { formatZodError } from '@/lib/errors/format-zod-error'
import { bankMatchActionBodySchema } from '@/lib/api-body-schemas'
import { isBankMatchPocEnabled } from '@/lib/bank-match/flags'
import { applyBankMatch, unmatchBankMatch } from '@/lib/bank-match/apply-match'
import { runMatchPassForProject } from '@/lib/bank-match/run-match-pass'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json({ error: 'מודול התאמות בנק כבוי', code: 'BANK_MATCH_DISABLED' }, { status: 503 })
  }
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id') || ''
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: txs, error } = await admin
    .from('bank_transactions')
    .select(
      `id, amount, currency, booked_at, description, reference, counterparty, direction,
       match_status, matched_charge_id, suggested_charge_id, match_confidence, source`
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('booked_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: openCharges } = await admin
    .from('collection_charges')
    .select(
      `id, amount, status, period_label, payment_reference, paid_at, bank_transaction_id,
       payment_confirmed_at, funds_received_at,
       residents ( full_name, apartment_number )`
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .in('status', ['sent', 'draft', 'paid'])
    .order('created_at', { ascending: false })
    .limit(200)

  const unmatched = (txs || []).filter((t) =>
    ['unmatched', 'suggested', 'unmatched_after_revoke'].includes(String(t.match_status))
  )
  const matched = (txs || []).filter((t) => t.match_status === 'matched_charge')
  const openDebt = (openCharges || []).filter((c) => c.status === 'sent' || c.status === 'draft')
  const awaitingMatch = unmatched.length

  return NextResponse.json({
    summary: {
      paid_matched: matched.length,
      open_debt: openDebt.length,
      awaiting_match: awaitingMatch,
    },
    transactions: txs || [],
    charges: openCharges || [],
  })
}

export async function POST(req: Request) {
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json({ error: 'מודול התאמות בנק כבוי', code: 'BANK_MATCH_DISABLED' }, { status: 503 })
  }
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'bank-match-action')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = bankMatchActionBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }
  const body = parsed.data

  if (body.action === 'run_pass') {
    const result = await runMatchPassForProject({
      admin,
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      applyAuto: true,
      actorUserId: auth.ctx.userId,
    })
    return NextResponse.json({ ok: true, result })
  }

  if (body.action === 'apply') {
    const result = await applyBankMatch({
      admin,
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      transactionId: body.transaction_id,
      chargeId: body.charge_id,
      confidence: 'manual',
      actorUserId: auth.ctx.userId,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, result })
  }

  if (body.action === 'unmatch') {
    const result = await unmatchBankMatch({
      admin,
      clientId: auth.ctx.clientId,
      projectId: body.project_id,
      transactionId: body.transaction_id,
      actorUserId: auth.ctx.userId,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, result })
  }

  if (body.action === 'suggest_ignore') {
    const { error } = await admin
      .from('bank_transactions')
      .update({
        match_status: 'ignored',
        suggested_charge_id: null,
      })
      .eq('id', body.transaction_id)
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', body.project_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'פעולה לא נתמכת' }, { status: 400 })
}
