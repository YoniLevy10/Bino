import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'

/** Manager view: recent site tours with worker + notes + defect link. */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const since = new Date()
  since.setDate(since.getDate() - 60)

  const { data, error } = await admin
    .from('worker_site_tours')
    .select(
      'id, completed_at, notes, defect_ticket_id, project_id, worker_id, projects(name, address), workers:worker_id(full_name)'
    )
    .eq('client_id', auth.ctx.clientId)
    .gte('completed_at', since.toISOString())
    .order('completed_at', { ascending: false })
    .limit(150)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const tours = (data || []).map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
    const worker = Array.isArray(row.workers) ? row.workers[0] : row.workers
    return {
      id: row.id,
      completed_at: row.completed_at,
      notes: row.notes,
      defect_ticket_id: row.defect_ticket_id,
      project_name: (project as { name?: string } | null)?.name || '',
      project_address: (project as { address?: string } | null)?.address || null,
      worker_name: (worker as { full_name?: string } | null)?.full_name || '',
    }
  })

  return NextResponse.json({ tours })
}
