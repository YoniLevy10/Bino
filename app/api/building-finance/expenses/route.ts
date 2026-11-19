import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { createBuildingExpenseBodySchema } from '@/lib/api-body-schemas'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import {
  BUILDING_EXPENSE_RECEIPTS_BUCKET,
  RECEIPT_SIGNED_URL_TTL_SEC,
  decodeReceiptStoragePath,
  isExternalReceiptUrl,
} from '@/lib/building-finance/receipt-storage'
import { roundMoney } from '@/lib/unit-ledger'
import { getLogger } from '@/lib/shared/logging'

type ExpenseListRow = {
  id: string
  project_id: string
  category_id: string | null
  vendor_name: string | null
  professional_id: string | null
  ticket_id: string | null
  amount: number
  currency: string
  expense_date: string
  description: string | null
  receipt_url: string | null
  payment_status: string
  budget_period_key: string | null
  created_at: string
  voided_at: string | null
}

async function attachSignedReceiptUrls(
  admin: ReturnType<typeof getSupabaseAdmin>,
  rows: ExpenseListRow[]
): Promise<Array<ExpenseListRow & { receipt_download_url: string | null }>> {
  return Promise.all(
    rows.map(async (row) => {
      const path = decodeReceiptStoragePath(row.receipt_url)
      if (path) {
        const { data } = await admin.storage
          .from(BUILDING_EXPENSE_RECEIPTS_BUCKET)
          .createSignedUrl(path, RECEIPT_SIGNED_URL_TTL_SEC)
        return { ...row, receipt_download_url: data?.signedUrl ?? null }
      }
      if (isExternalReceiptUrl(row.receipt_url)) {
        return { ...row, receipt_download_url: row.receipt_url }
      }
      return { ...row, receipt_download_url: null }
    })
  )
}

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
      'id, project_id, category_id, vendor_name, professional_id, ticket_id, amount, currency, expense_date, description, receipt_url, payment_status, budget_period_key, created_at, voided_at'
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

  const expenses = await attachSignedReceiptUrls(admin, (data ?? []) as ExpenseListRow[])
  return NextResponse.json({ expenses })
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

  if (body.ticket_id) {
    const { data: ticket, error: ticketError } = await admin
      .from('tickets')
      .select('id')
      .eq('id', body.ticket_id)
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', body.project_id)
      .maybeSingle()
    if (ticketError) {
      return NextResponse.json({ error: 'שגיאה באימות תקלה' }, { status: 500 })
    }
    if (!ticket) {
      return NextResponse.json({ error: 'תקלה לא נמצאה בבניין זה' }, { status: 400 })
    }
  }

  if (body.professional_id) {
    const { data: pro, error: proError } = await admin
      .from('professionals')
      .select('id')
      .eq('id', body.professional_id)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .maybeSingle()
    if (proError) {
      return NextResponse.json({ error: 'שגיאה באימות איש מקצוע' }, { status: 500 })
    }
    if (!pro) {
      return NextResponse.json({ error: 'איש מקצוע לא נמצא' }, { status: 400 })
    }
  }

  if (body.category_id) {
    const { data: cat, error: catError } = await admin
      .from('building_expense_categories')
      .select('id')
      .eq('id', body.category_id)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (catError) {
      return NextResponse.json({ error: 'שגיאה באימות קטגוריה' }, { status: 500 })
    }
    if (!cat) {
      return NextResponse.json({ error: 'קטגוריה לא נמצאה' }, { status: 400 })
    }
  }

  const amount = roundMoney(body.amount)
  const row = {
    client_id: auth.ctx.clientId,
    project_id: body.project_id,
    category_id: body.category_id ?? null,
    vendor_name: body.vendor_name ?? null,
    professional_id: body.professional_id ?? null,
    ticket_id: body.ticket_id ?? null,
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
      'id, project_id, category_id, vendor_name, professional_id, ticket_id, amount, currency, expense_date, description, receipt_url, payment_status, budget_period_key, created_at'
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
