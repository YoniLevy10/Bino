import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { workerLogTourBodySchema } from '@/lib/api-body-schemas'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  TICKET_ATTACHMENT_MAX_WORKER_BYTES,
  TICKET_ATTACHMENT_WORKER_MIME_TYPES,
} from '@/lib/ticket-attachment-upload'
import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'

const TOURS_LOOKBACK_DAYS = 30
const TOURS_LIMIT = 80

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

async function attachTourPhoto(
  admin: ReturnType<typeof getSupabaseAdmin>,
  opts: { tourId: string; clientId: string; file: File }
): Promise<string | null> {
  if (!(TICKET_ATTACHMENT_WORKER_MIME_TYPES as readonly string[]).includes(opts.file.type)) {
    return null
  }
  if (opts.file.size > TICKET_ATTACHMENT_MAX_WORKER_BYTES) return null
  const ext = opts.file.name.split('.').pop() || 'jpg'
  const path = `site-tours/${opts.tourId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const bytes = Buffer.from(await opts.file.arrayBuffer())
  const { error: upErr } = await admin.storage
    .from('ticket-attachments')
    .upload(path, bytes, { contentType: opts.file.type, upsert: false })
  if (upErr) return null
  await admin.from('worker_site_tour_attachments').insert({
    tour_id: opts.tourId,
    client_id: opts.clientId,
    file_name: opts.file.name,
    file_url: path,
    mime_type: opts.file.type,
  })
  return path
}

export async function GET(req: NextRequest) {
  try {
    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    const since = new Date()
    since.setDate(since.getDate() - TOURS_LOOKBACK_DAYS)

    const [projectsRes, toursRes] = await Promise.all([
      admin
        .from('projects')
        .select('id, name, address, project_code')
        .eq('client_id', worker.client_id)
        .eq('is_active', true)
        .order('name'),
      admin
        .from('worker_site_tours')
        .select('id, project_id, completed_at, notes, defect_ticket_id, projects(name)')
        .eq('client_id', worker.client_id)
        .eq('worker_id', worker.id)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })
        .limit(TOURS_LIMIT),
    ])

    if (projectsRes.error || toursRes.error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const tourIds = (toursRes.data || []).map((r) => r.id as string)
    const photoByTour = new Map<string, { file_url: string; mime_type: string | null }[]>()
    if (tourIds.length) {
      const { data: photos } = await admin
        .from('worker_site_tour_attachments')
        .select('tour_id, file_url, mime_type')
        .in('tour_id', tourIds)
      for (const p of photos || []) {
        const list = photoByTour.get(p.tour_id as string) || []
        list.push({
          file_url: p.file_url as string,
          mime_type: (p.mime_type as string | null) || null,
        })
        photoByTour.set(p.tour_id as string, list)
      }
    }

    const tours = await Promise.all(
      (toursRes.data || []).map(async (row) => {
        const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects
        const rawPhotos = photoByTour.get(row.id as string) || []
        const photos = []
        for (const ph of rawPhotos.slice(0, 4)) {
          const url = await createServerSignedAttachmentUrl(admin, ph.file_url)
          if (url) photos.push({ public_url: url, mime_type: ph.mime_type })
        }
        return {
          id: row.id,
          project_id: row.project_id,
          project_name: (proj as { name?: string } | null)?.name || '',
          completed_at: row.completed_at,
          notes: row.notes,
          defect_ticket_id: row.defect_ticket_id,
          photos,
        }
      })
    )

    return NextResponse.json({
      projects: projectsRes.data || [],
      tours,
      full_name: worker.full_name,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-tours-post')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const contentType = (req.headers.get('content-type') || '').toLowerCase()
    let tokenRaw = ''
    let projectIdRaw = ''
    let completedAtRaw: string | undefined
    let notesRaw: string | undefined
    let file: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      tokenRaw = form.get('token')?.toString() || ''
      projectIdRaw = form.get('project_id')?.toString() || ''
      completedAtRaw = form.get('completed_at')?.toString() || undefined
      notesRaw = form.get('notes')?.toString() || undefined
      const fileValue = form.get('file')
      file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null
    } else {
      let rawBody: unknown
      try {
        rawBody = await req.json()
      } catch {
        return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
      }
      const parsed = workerLogTourBodySchema.safeParse(rawBody)
      if (!parsed.success) {
        return NextResponse.json({ error: 'בקשה לא תקינה', details: parsed.error.flatten() }, { status: 400 })
      }
      tokenRaw = parsed.data.token
      projectIdRaw = parsed.data.project_id
      completedAtRaw = parsed.data.completed_at
      notesRaw = parsed.data.notes
    }

    const token = sanitizeId(tokenRaw)
    const projectId = sanitizeId(projectIdRaw)
    if (!token || !projectId) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('client_id', worker.client_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!project) {
      return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
    }

    let completedAt = new Date().toISOString()
    if (completedAtRaw) {
      const parsedDate = new Date(completedAtRaw)
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: 'שעה לא תקינה' }, { status: 400 })
      }
      const now = Date.now()
      const min = now - 7 * 24 * 60 * 60 * 1000
      const max = now + 5 * 60 * 1000
      const ts = parsedDate.getTime()
      if (ts < min || ts > max) {
        return NextResponse.json({ error: 'שעת הסיור חייבת להיות ב-7 הימים האחרונים' }, { status: 400 })
      }
      completedAt = parsedDate.toISOString()
    }

    const notes = notesRaw?.trim() || null

    const { data: inserted, error } = await admin
      .from('worker_site_tours')
      .insert({
        client_id: worker.client_id,
        worker_id: worker.id,
        project_id: projectId,
        completed_at: completedAt,
        notes,
      })
      .select('id, project_id, completed_at, notes, projects(name)')
      .maybeSingle()

    if (error || !inserted) {
      console.error('[worker/tours POST]', error?.message)
      return NextResponse.json({ error: 'רישום הסיור נכשל' }, { status: 400 })
    }

    let photos: { public_url: string; mime_type: string | null }[] = []
    if (file) {
      const path = await attachTourPhoto(admin, {
        tourId: inserted.id as string,
        clientId: worker.client_id,
        file,
      })
      if (path) {
        const url = await createServerSignedAttachmentUrl(admin, path)
        if (url) photos = [{ public_url: url, mime_type: file.type }]
      }
    }

    const proj = Array.isArray(inserted.projects) ? inserted.projects[0] : inserted.projects

    return NextResponse.json({
      ok: true,
      tour: {
        id: inserted.id,
        project_id: inserted.project_id,
        project_name: (proj as { name?: string } | null)?.name || '',
        completed_at: inserted.completed_at,
        notes: inserted.notes,
        photos,
      },
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
