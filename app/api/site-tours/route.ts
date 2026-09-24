import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'

/** Manager view: recent site tours with worker + notes + photos + defect link. */
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

  const tourIds = (data || []).map((r) => r.id as string)
  const photosByTour = new Map<string, { file_url: string; mime_type: string | null }[]>()
  if (tourIds.length) {
    const { data: photos } = await admin
      .from('worker_site_tour_attachments')
      .select('tour_id, file_url, mime_type')
      .in('tour_id', tourIds)
    for (const p of photos || []) {
      const list = photosByTour.get(p.tour_id as string) || []
      list.push({
        file_url: p.file_url as string,
        mime_type: (p.mime_type as string | null) || null,
      })
      photosByTour.set(p.tour_id as string, list)
    }
  }

  const tours = await Promise.all(
    (data || []).map(async (row) => {
      const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
      const worker = Array.isArray(row.workers) ? row.workers[0] : row.workers
      const raw = photosByTour.get(row.id as string) || []
      const photos = []
      for (const ph of raw.slice(0, 6)) {
        const url = await createServerSignedAttachmentUrl(admin, ph.file_url)
        if (url) photos.push({ public_url: url, mime_type: ph.mime_type })
      }
      return {
        id: row.id,
        completed_at: row.completed_at,
        notes: row.notes,
        defect_ticket_id: row.defect_ticket_id,
        project_name: (project as { name?: string } | null)?.name || '',
        project_address: (project as { address?: string } | null)?.address || null,
        worker_name: (worker as { full_name?: string } | null)?.full_name || '',
        photos,
      }
    })
  )

  return NextResponse.json({ tours })
}
