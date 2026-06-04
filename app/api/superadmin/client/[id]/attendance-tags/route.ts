import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminAuthorized } from '@/lib/superadmin-auth'
import { createNfcTagBodySchema } from '@/lib/api-body-schemas'
import { getWorkerAttendanceScanUrl } from '@/lib/public-app-url'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params
  const admin = getSupabaseAdmin()

  const { data, error } = await admin
    .from('worker_nfc_tags')
    .select('id, tag_code, tag_type, project_id, label, is_active, created_at, projects(name, project_code)')
    .eq('client_id', clientId)
    .order('tag_code')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const tags = (data || []).map((row) => {
    const code = (row as { tag_code: string }).tag_code
    let scan_url = `/worker/nfc?t=${encodeURIComponent(code)}`
    try {
      scan_url = getWorkerAttendanceScanUrl(code)
    } catch {
      /* NEXT_PUBLIC_APP_URL missing in dev */
    }
    return { ...row, scan_url }
  })

  return NextResponse.json({ client_id: clientId, tags })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = createNfcTagBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  if (d.tag_type === 'project' && !d.project_id) {
    return NextResponse.json({ error: 'תג פרויקט דורש project_id' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  if (d.project_id) {
    const { data: proj } = await admin
      .from('projects')
      .select('id')
      .eq('id', d.project_id)
      .eq('client_id', clientId)
      .maybeSingle()
    if (!proj) {
      return NextResponse.json({ error: 'פרויקט לא שייך ללקוח' }, { status: 400 })
    }
  }

  const tagCode = d.tag_code.trim().toUpperCase()
  const { data: created, error } = await admin
    .from('worker_nfc_tags')
    .insert({
      client_id: clientId,
      tag_code: tagCode,
      tag_type: d.tag_type,
      project_id: d.tag_type === 'project' ? d.project_id : null,
      label: d.label?.trim() || null,
      is_active: d.is_active !== false,
    })
    .select('id, tag_code, tag_type, project_id, label, is_active')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'קוד תג כבר קיים' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let scan_url = `/worker/nfc?t=${encodeURIComponent(tagCode)}`
  try {
    scan_url = getWorkerAttendanceScanUrl(tagCode)
  } catch {
    /* ignore */
  }

  return NextResponse.json({ tag: created, scan_url })
}
