import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/api-auth'
import { createBuildingExpenseBodySchema } from '@/lib/api-body-schemas'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { roundMoney } from '@/lib/unit-ledger'
import { getLogger } from '@/lib/logging'

export const dynamic = 'force-dynamic'

function platformDisabled() {
  return NextResponse.json(
    { error: 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה', code: 'FINANCE_PLATFORM_DISABLED' },
    { status: 503 }
  )
}

/** List recent building expenses for a project (bounded). */
export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }

  const limitRaw = Number(url.searchParams.get('limit') || '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50

  const admin = getSupabaseAdmin()
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (projectError) {
    return NextResponse.json({ error: 'שגיאה בטעינת פרויקט' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('building_expenses')
    .select(
      'id, project_id, category_id, vendor_name, professional_id, amount, currency, expense_date, description, payment_status, budget_period_key, created_at, voided_at'
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .is('voided_at', null)
    .order('expense_date', { ascending: false })
    .limit(limit)

  if (error) {
    getLogger().error(
      'BUILDING_FINANCE',
      'expenses list failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בטעינת הוצאות' }, { status: 500 })
  }

  return NextResponse.json({ expenses: data ?? [] })
}

/** Create a building expense (idempotent). */
export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = createBuildingExpenseBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-finance-expense'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id')
    .eq('id', body.project_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (projectError) {
    return NextResponse.json({ error: 'שגיאה בטעינת פרויקט' }, { status: 500 })
  }
  if (!project) {
    return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const amount = roundMoney(body.amount)
  const row = {
    client_id: auth.ctx.clientId,
    project_id: body.project_id,
    category_id: body.category_id ?? null,
    vendor_name: body.vendor_name ?? null,
    professional_id: body.professional_id ?? null,
    amount,
    currency: 'ILS',
    expense_date: body.expense_date ?? undefined,
    description: body.description ?? null,
    receipt_url: body.receipt_url ?? null,
    payment_status: body.payment_status ?? 'unpaid',
    budget_period_key: body.budget_period_key ?? null,
    idempotency_key: body.idempotency_key,
    created_by: auth.ctx.userId,
  }

  const { data, error } = await admin
    .from('building_expenses')
    .upsert(row, { onConflict: 'client_id,idempotency_key', ignoreDuplicates: false })
    .select(
      'id, project_id, category_id, vendor_name, amount, currency, expense_date, description, payment_status, budget_period_key, created_at'
    )
    .single()

  if (error) {
    getLogger().error(
      'BUILDING_FINANCE',
      'expense create failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בשמירת הוצאה' }, { status: 500 })
  }

  let budget_alert: { alerted: boolean; kind?: string; skippedReason?: string } | null = null
  const periodKey =
    (data as { budget_period_key?: string | null } | null)?.budget_period_key ||
    body.budget_period_key ||
    null
  if (periodKey) {
    try {
      const { maybeNotifyBudgetAlert } = await import('@/lib/building-finance/budget-alert-notify')
      const alert = await maybeNotifyBudgetAlert(admin, {
        clientId: auth.ctx.clientId,
        projectId: body.project_id,
        periodKey,
        userId: auth.ctx.userId,
      })
      budget_alert = {
        alerted: alert.alerted,
        kind: alert.kind,
        skippedReason: alert.skippedReason,
      }
    } catch (e) {
      getLogger().warn('BUILDING_FINANCE', 'budget alert after expense failed', {
        err: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ expense: data, budget_alert }, { status: 201 })
}
