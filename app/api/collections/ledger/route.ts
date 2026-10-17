import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import {
  computeRunningBalances,
  listLedgerEntriesForUnit,
  syncChargesIntoLedger,
} from '@/lib/unit-ledger'
import { formatChargeAmountIls } from '@/lib/collection-charges'

/**
 * GET /api/collections/ledger?unit_id=… | resident_id=… [&project_id=…]
 * Returns unit ledger entries (oldest→newest) with running balance.
 */
export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.collections)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'collections-ledger')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const url = new URL(req.url)
  const unitId = url.searchParams.get('unit_id')?.trim() || ''
  const residentId = url.searchParams.get('resident_id')?.trim() || ''
  const projectId = url.searchParams.get('project_id')?.trim() || ''
  const sync = url.searchParams.get('sync') !== '0'

  if (!unitId && !residentId) {
    return NextResponse.json(
      { error: 'נא לציין unit_id או resident_id' },
      { status: 400 }
    )
  }

  let unitLabel: string | null = null
  let residentName: string | null = null
  let resolvedUnitId = unitId || null
  let resolvedResidentId = residentId || null
  let resolvedProjectId = projectId || null

  if (residentId) {
    const { data: resident } = await admin
      .from('residents')
      .select('id, full_name, apartment_number, unit_id, project_id')
      .eq('id', residentId)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!resident) {
      return NextResponse.json({ error: 'דייר לא נמצא' }, { status: 404 })
    }
    residentName = resident.full_name
    unitLabel = resident.apartment_number
      ? `דירה ${resident.apartment_number}`
      : null
    if (!resolvedUnitId && resident.unit_id) resolvedUnitId = resident.unit_id
    if (!resolvedProjectId && resident.project_id) resolvedProjectId = resident.project_id
  }

  if (resolvedUnitId) {
    const { data: unit } = await admin
      .from('project_units')
      .select('id, unit_number, project_id')
      .eq('id', resolvedUnitId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!unit) {
      return NextResponse.json({ error: 'דירה לא נמצאה' }, { status: 404 })
    }
    unitLabel = unitLabel || `דירה ${unit.unit_number}`
    if (!resolvedProjectId) resolvedProjectId = unit.project_id
  }

  if (sync) {
    try {
      await syncChargesIntoLedger(admin, {
        clientId: auth.ctx.clientId,
        unitId: resolvedUnitId,
        residentId: resolvedResidentId,
        projectId: resolvedProjectId,
      })
    } catch (e) {
      console.error('[collections/ledger] sync failed', e)
    }
  }

  const { entries, balance } = await listLedgerEntriesForUnit(admin, {
    clientId: auth.ctx.clientId,
    unitId: resolvedUnitId,
    // When we have unit_id, list by unit so history survives resident changes.
    residentId: resolvedUnitId ? null : resolvedResidentId,
    projectId: resolvedProjectId,
  })

  const withRunning = computeRunningBalances(entries)
  const creditBalance = balance < 0 ? Math.abs(balance) : 0
  const debtBalance = balance > 0 ? balance : 0

  return NextResponse.json({
    unit_id: resolvedUnitId,
    resident_id: resolvedResidentId,
    project_id: resolvedProjectId,
    unit_label: unitLabel,
    resident_name: residentName,
    balance,
    debt: debtBalance,
    credit: creditBalance,
    balance_label: formatChargeAmountIls(Math.abs(balance)),
    balance_kind: balance > 0 ? 'debt' : balance < 0 ? 'credit' : 'zero',
    entries: withRunning.map((e) => ({
      ...e,
      amount_label: formatChargeAmountIls(Number(e.amount)),
      running_balance_label: formatChargeAmountIls(Math.abs(e.running_balance)),
    })),
  })
}
