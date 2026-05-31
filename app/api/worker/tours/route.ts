import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { workerLogTourBodySchema } from '@/lib/api-body-schemas'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'

const TOURS_LOOKBACK_DAYS = 30
const TOURS_LIMIT = 80

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
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
        .select('id, project_id, completed_at, notes, projects(name)')
        .eq('client_id', worker.client_id)
        .eq('worker_id', worker.id)
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })
        .limit(TOURS_LIMIT),
    ])

    if (projectsRes.error) {
      console.error('[worker/tours GET projects]', projectsRes.error.message)
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }
    if (toursRes.error) {
      console.error('[worker/tours GET tours]', toursRes.error.message)
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const tours = (toursRes.data || []).map((row) => {
      const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects
      return {
        id: row.id,
        project_id: row.project_id,
        project_name: (proj as { name?: string } | null)?.name || '',
        completed_at: row.completed_at,
        notes: row.notes,
      }
    })

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

    const token = sanitizeId(parsed.data.token)
    const projectId = sanitizeId(parsed.data.project_id)
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
    if (parsed.data.completed_at) {
      const parsedDate = new Date(parsed.data.completed_at)
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

    const notes = parsed.data.notes?.trim() || null

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

    const proj = Array.isArray(inserted.projects) ? inserted.projects[0] : inserted.projects

    return NextResponse.json({
      ok: true,
      tour: {
        id: inserted.id,
        project_id: inserted.project_id,
        project_name: (proj as { name?: string } | null)?.name || '',
        completed_at: inserted.completed_at,
        notes: inserted.notes,
      },
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
