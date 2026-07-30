import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import {
  COLLECTION_CHARGE_STATUSES,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'

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

  let query = admin
    .from('collection_charges')
    .select('status')
    .eq('client_id', auth.ctx.clientId)

  if (projectId) query = query.eq('project_id', projectId)
  if (periodLabel) query = query.eq('period_label', periodLabel)
  if (batchId) query = query.eq('batch_id', batchId)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const counts: Record<CollectionChargeStatus, number> = {
    draft: 0,
    sent: 0,
    paid: 0,
    failed: 0,
    cancelled: 0,
  }

  for (const row of data || []) {
    const status = (row as { status: string }).status
    if ((COLLECTION_CHARGE_STATUSES as readonly string[]).includes(status)) {
      counts[status as CollectionChargeStatus] += 1
    }
  }

  const pending = counts.draft + counts.sent
  return NextResponse.json({
    counts,
    chips: {
      sent: counts.sent,
      paid: counts.paid,
      pending,
      failed: counts.failed,
    },
  })
}
