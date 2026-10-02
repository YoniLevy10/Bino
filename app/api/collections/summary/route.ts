import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import {
  COLLECTION_CHARGE_STATUSES,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

type ChargeAggRow = { status: string; amount: number | string }

export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'collections-summary')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim() || ''
  const periodLabel = url.searchParams.get('period_label')?.trim() || ''
  const batchId = url.searchParams.get('batch_id')?.trim() || ''

  let data: ChargeAggRow[]
  try {
    // Paginate past PostgREST 1000-row cap (audit #31) instead of a single unbounded select.
    data = await fetchAllRows<ChargeAggRow>((from, to) => {
      let query = admin
        .from('collection_charges')
        .select('status, amount')
        .eq('client_id', auth.ctx.clientId)
        .order('id', { ascending: true })
        .range(from, to)
      if (projectId) query = query.eq('project_id', projectId)
      if (periodLabel) query = query.eq('period_label', periodLabel)
      if (batchId) query = query.eq('batch_id', batchId)
      return query
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאת שרת'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const counts: Record<CollectionChargeStatus, number> = {
    draft: 0,
    sent: 0,
    paid: 0,
    failed: 0,
    cancelled: 0,
  }
  let collectedAmount = 0
  let outstandingAmount = 0
  let billedAmount = 0

  for (const row of data) {
    const status = row.status
    const amount = Number(row.amount) || 0
    if (!(COLLECTION_CHARGE_STATUSES as readonly string[]).includes(status)) continue
    counts[status as CollectionChargeStatus] += 1
    if (status === 'cancelled') continue
    billedAmount += amount
    if (status === 'paid') collectedAmount += amount
    else if (status === 'sent' || status === 'draft' || status === 'failed') {
      outstandingAmount += amount
    }
  }

  const pending = counts.draft + counts.sent
  const openCount = pending + counts.failed
  const collectionRate =
    billedAmount > 0 ? Math.round((collectedAmount / billedAmount) * 100) : 0

  return NextResponse.json({
    counts,
    chips: {
      sent: counts.sent,
      paid: counts.paid,
      pending,
      failed: counts.failed,
    },
    money: {
      collected: collectedAmount,
      outstanding: outstandingAmount,
      billed: billedAmount,
      collection_rate: collectionRate,
      open_count: openCount,
      paid_count: counts.paid,
    },
  })
}
