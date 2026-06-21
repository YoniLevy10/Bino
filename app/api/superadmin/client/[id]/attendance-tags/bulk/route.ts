import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminAuthorized } from '@/lib/superadmin-auth'
import { buildNfcTagScanUrl, normalizeTagCode } from '@/lib/nfc-tag-utils'

type CreatedTag = {
  id: string
  tag_code: string
  tag_type: string
  label: string | null
  scan_url: string
}

/** Create office tag + one tag per project (skips existing codes). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSuperAdminAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: clientId } = await params
  let includeOffice = true
  let officeTagCode = 'OFFICE'

  try {
    const body = (await req.json()) as { include_office?: boolean; office_tag_code?: string }
    if (body.include_office === false) includeOffice = false
    if (body.office_tag_code?.trim()) officeTagCode = normalizeTagCode(body.office_tag_code)
  } catch {
    /* defaults */
  }

  const admin = getSupabaseAdmin()

  const { data: existingRows, error: existingErr } = await admin
    .from('worker_nfc_tags')
    .select('tag_code')
    .eq('client_id', clientId)

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }

  const existing = new Set((existingRows ?? []).map((r) => normalizeTagCode((r as { tag_code: string }).tag_code)))

  const { data: projects, error: projErr } = await admin
    .from('projects')
    .select('id, name, project_code')
    .eq('client_id', clientId)
    .order('name')

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 })
  }

  const toInsert: {
    client_id: string
    tag_code: string
    tag_type: 'office' | 'project'
    project_id: string | null
    label: string | null
    is_active: boolean
  }[] = []

  if (includeOffice && !existing.has(officeTagCode)) {
    toInsert.push({
      client_id: clientId,
      tag_code: officeTagCode,
      tag_type: 'office',
      project_id: null,
      label: 'משרד',
      is_active: true,
    })
  }

  for (const p of projects ?? []) {
    const row = p as { id: string; name: string; project_code: string }
    const code = normalizeTagCode(row.project_code)
    if (!code || existing.has(code)) continue
    toInsert.push({
      client_id: clientId,
      tag_code: code,
      tag_type: 'project',
      project_id: row.id,
      label: row.name,
      is_active: true,
    })
    existing.add(code)
  }

  if (toInsert.length === 0) {
    return NextResponse.json({
      created: [] as CreatedTag[],
      skipped_existing: (existingRows ?? []).length,
      message: 'כל התגים כבר קיימים',
    })
  }

  const { data: created, error: insertErr } = await admin
    .from('worker_nfc_tags')
    .insert(toInsert)
    .select('id, tag_code, tag_type, label')

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const createdTags: CreatedTag[] = (created ?? []).map((row) => {
    const tag = row as { id: string; tag_code: string; tag_type: string; label: string | null }
    return {
      ...tag,
      scan_url: buildNfcTagScanUrl(tag.tag_code),
    }
  })

  return NextResponse.json({
    created: createdTags,
    created_count: createdTags.length,
    project_count: projects?.length ?? 0,
    message: `נוצרו ${createdTags.length} תגים`,
  })
}
