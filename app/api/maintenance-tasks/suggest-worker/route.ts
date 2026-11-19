import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { suggestTaskWorkerBodySchema } from '@/lib/api-body-schemas'
import { assertProjectOwnedByClient } from '@/lib/tenant-owned-refs'
import { suggestWorkerForMaintenanceTask } from '@/lib/recommendations/suggest-worker-for-task'

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'maintenance-suggest-worker'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = suggestTaskWorkerBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const projectOk = await assertProjectOwnedByClient(
    admin,
    auth.ctx.clientId,
    parsed.data.project_id
  )
  if (!projectOk.ok) {
    return NextResponse.json({ error: projectOk.error }, { status: 400 })
  }

  const [historyRes, workersRes] = await Promise.all([
    admin
      .from('maintenance_tasks')
      .select('id, project_id, title, description, assigned_worker_id, status')
      .eq('client_id', auth.ctx.clientId)
      .eq('project_id', parsed.data.project_id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(80),
    admin
      .from('workers')
      .select('id, full_name, is_active')
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .limit(100),
  ])

  const suggestion = suggestWorkerForMaintenanceTask({
    projectId: parsed.data.project_id,
    title: parsed.data.title,
    description: parsed.data.description,
    assignedWorkerId: parsed.data.assigned_worker_id,
    history: historyRes.data || [],
    workers: workersRes.data || [],
    projectDefaultWorkerId: null,
  })

  return NextResponse.json({ suggestion })
}
