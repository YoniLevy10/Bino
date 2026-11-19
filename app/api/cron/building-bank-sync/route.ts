import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isBankMatchPocEnabled } from '@/lib/bank-match/flags'
import { runMatchPassForProject } from '@/lib/bank-match/run-match-pass'

export const dynamic = 'force-dynamic'

function yearMonth(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Daily cron: for buildings with sync_day_of_month = today, require CSV import
 * this month then re-run match. File-import only (no live bank scrape).
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'bank_match_disabled' })
  }

  const admin = getSupabaseAdmin()
  // Use Asia/Jerusalem day-of-month roughly via local offset +2/+3 — use UTC+2 as heuristic
  const jerusalemHourOffset = 2
  const local = new Date(Date.now() + jerusalemHourOffset * 3600_000)
  const day = local.getUTCDate()
  const ym = yearMonth(local)

  const { data: accounts, error } = await admin
    .from('building_bank_accounts')
    .select('id, client_id, project_id, last_import_at')
    .eq('sync_enabled', true)
    .eq('is_active', true)
    .eq('sync_day_of_month', day)
    .limit(40)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []

  for (const acct of accounts || []) {
    const clientId = acct.client_id as string
    const projectId = acct.project_id as string

    const { data: existingRun } = await admin
      .from('building_bank_sync_runs')
      .select('id, status')
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .eq('year_month', ym)
      .maybeSingle()

    if (existingRun && existingRun.status === 'ok') {
      results.push({ project_id: projectId, skipped: 'already_ok' })
      continue
    }

    if (!existingRun) {
      await admin.from('building_bank_sync_runs').insert({
        client_id: clientId,
        project_id: projectId,
        year_month: ym,
        status: 'started',
      })
    }

    const lastImport = acct.last_import_at
      ? new Date(String(acct.last_import_at)).getTime()
      : 0
    const monthStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
    if (lastImport < monthStart) {
      await admin
        .from('building_bank_accounts')
        .update({
          connection_status: 'awaiting_import',
          last_sync_at: new Date().toISOString(),
          last_sync_error: 'ממתין לייבוא דף בנק (CSV / Excel / PDF) לחודש הנוכחי',
        })
        .eq('id', acct.id)
      await admin
        .from('building_bank_sync_runs')
        .update({ status: 'awaiting_import', detail: 'no_file_import_this_month' })
        .eq('client_id', clientId)
        .eq('project_id', projectId)
        .eq('year_month', ym)
      results.push({ project_id: projectId, status: 'awaiting_import' })
      continue
    }

    const match = await runMatchPassForProject({
      admin,
      clientId,
      projectId,
      applyAuto: true,
    })
    await admin
      .from('building_bank_accounts')
      .update({
        connection_status: 'ok',
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq('id', acct.id)
    await admin
      .from('building_bank_sync_runs')
      .update({
        status: 'ok',
        detail: `match_auto=${match.autoApplied}`,
      })
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .eq('year_month', ym)
    results.push({ project_id: projectId, status: 'ok', match })
  }

  return NextResponse.json({ ok: true, day, year_month: ym, results })
}
