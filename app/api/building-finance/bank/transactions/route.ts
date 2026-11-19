import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyBankSyncEnabled } from '@/lib/bank/flags'
import { z } from 'zod'
import { formatZodError } from '@/lib/errors/format-zod-error'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json(
      { error: 'חשבון בנק כבוי בפלטפורמה', code: 'FINANCY_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  // Bank is client-wide — do not filter by building project_id.
  const limitRaw = Number(url.searchParams.get('limit') || '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('bank_transactions')
    .select(
      'id, project_id, bank_account_id, external_id, external_sk, amount, currency, booked_at, description, merchant_name, category_main, category_sub, match_status, matched_charge_id, matched_expense_id, synced_at'
    )
    .eq('client_id', auth.ctx.clientId)
    .order('booked_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ transactions: data || [] })
}

const matchBodySchema = z.object({
  transaction_id: z.string().uuid(),
  match_status: z.enum(['unmatched', 'matched_charge', 'matched_expense', 'ignored']),
  matched_charge_id: z.string().uuid().nullable().optional(),
  matched_expense_id: z.string().uuid().nullable().optional(),
})

/** Match / ignore a bank transaction (collections / expense wiring). */
export async function PATCH(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBankSyncEnabled()) {
    return NextResponse.json(
      { error: 'חשבון בנק כבוי בפלטפורמה', code: 'FINANCY_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-tx-match'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = matchBodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const body = validated.data
  const { error } = await admin
    .from('bank_transactions')
    .update({
      match_status: body.match_status,
      matched_charge_id: body.matched_charge_id ?? null,
      matched_expense_id: body.matched_expense_id ?? null,
    })
    .eq('client_id', auth.ctx.clientId)
    .eq('id', body.transaction_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
