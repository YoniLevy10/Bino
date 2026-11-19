import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/auth-api/api-auth'

/**
 * KPI: % of DONE maintenance tasks completed by worker without manager
 * re-edit within 24h of completion. Window: last 30 days. Bounded.
 */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('maintenance_tasks')
    .select('id, completed_at, completed_by_worker_id, completed_by_user_id, updated_at')
    .eq('client_id', auth.ctx.clientId)
    .eq('status', 'DONE')
    .is('deleted_at', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  let withoutManager = 0
  for (const r of rows) {
    if (!r.completed_by_worker_id) continue
    if (r.completed_by_user_id) continue
    const completedAt = r.completed_at ? new Date(r.completed_at).getTime() : 0
    const updatedAt = r.updated_at ? new Date(r.updated_at).getTime() : completedAt
    // Manager "intervention" if updated more than ~1 min after complete and no worker-only stamp
    if (updatedAt - completedAt > 24 * 60 * 60 * 1000) continue
    withoutManager += 1
  }

  const total = rows.length
  const pct = total === 0 ? 0 : Math.round((withoutManager / total) * 1000) / 10

  return NextResponse.json({
    window_days: 30,
    done_count: total,
    without_manager_count: withoutManager,
    without_manager_pct: pct,
  })
}
