import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/api-auth'
import { upsertBuildingBudgetBodySchema } from '@/lib/api-body-schemas'
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

/** List budgets for a project (bounded). */
export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')
  if (!projectId) {
    return NextResponse.json({ error: 'project_id נדרש' }, { status: 400 })
  }

  const periodKey = url.searchParams.get('period_key')

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

  let query = admin
    .from('building_budgets')
    .select(
      'id, project_id, period_key, category_id, amount_planned, currency, notes, created_at, updated_at'
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .is('category_id', null)
    .order('period_key', { ascending: false })
    .limit(24)

  if (periodKey) {
    query = query.eq('period_key', periodKey)
  }

  const { data, error } = await query
  if (error) {
    getLogger().error(
      'BUILDING_FINANCE',
      'budgets list failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בטעינת תקציב' }, { status: 500 })
  }

  return NextResponse.json({ budgets: data ?? [] })
}

/** Upsert building-level (category-null) budget for a period. */
export async function PUT(req: Request) {
  if (!isBuildingFinancePlatformEnabled()) return platformDisabled()

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
  }

  const parsed = upsertBuildingBudgetBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const body = parsed.data

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'building-finance-budget'
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

  const amountPlanned = roundMoney(body.amount_planned)
  const nowIso = new Date().toISOString()

  const { data: existing, error: existingError } = await admin
    .from('building_budgets')
    .select('id')
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', body.project_id)
    .eq('period_key', body.period_key)
    .is('category_id', null)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: 'שגיאה בטעינת תקציב' }, { status: 500 })
  }

  if (existing?.id) {
    const { data, error } = await admin
      .from('building_budgets')
      .update({
        amount_planned: amountPlanned,
        notes: body.notes ?? null,
        updated_at: nowIso,
        created_by: auth.ctx.userId,
      })
      .eq('id', existing.id)
      .eq('client_id', auth.ctx.clientId)
      .select(
        'id, project_id, period_key, category_id, amount_planned, currency, notes, created_at, updated_at'
      )
      .single()

    if (error) {
      getLogger().error(
        'BUILDING_FINANCE',
        'budget update failed',
        new Error(error.message),
        { clientId: auth.ctx.clientId }
      )
      return NextResponse.json({ error: 'שגיאה בעדכון תקציב' }, { status: 500 })
    }
    return NextResponse.json({ budget: data })
  }

  const { data, error } = await admin
    .from('building_budgets')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: body.project_id,
      period_key: body.period_key,
      category_id: null,
      amount_planned: amountPlanned,
      currency: 'ILS',
      notes: body.notes ?? null,
      created_by: auth.ctx.userId,
      updated_at: nowIso,
    })
    .select(
      'id, project_id, period_key, category_id, amount_planned, currency, notes, created_at, updated_at'
    )
    .single()

  if (error) {
    getLogger().error(
      'BUILDING_FINANCE',
      'budget create failed',
      new Error(error.message),
      { clientId: auth.ctx.clientId }
    )
    return NextResponse.json({ error: 'שגיאה בשמירת תקציב' }, { status: 500 })
  }

  return NextResponse.json({ budget: data }, { status: 201 })
}
