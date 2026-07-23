import { NextResponse } from 'next/server'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { deleteProjectDocumentBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = 'project-documents'
const MAX_BYTES = 15 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'application/zip',
  'application/octet-stream',
])

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-()\u0590-\u05FF ]+/g, '_').slice(0, 180) || 'file'
}

export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents)
  if (!auth.ok) return auth.response

  const projectId = new URL(req.url).searchParams.get('project_id')?.trim()
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const { data: rows, error } = await admin
    .from('project_documents')
    .select('id, file_name, mime_type, file_size, notes, created_at, storage_path')
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const documents = await Promise.all(
    (rows ?? []).map(async (row) => {
      const r = row as {
        id: string
        file_name: string
        mime_type: string | null
        file_size: number | null
        notes: string | null
        created_at: string
        storage_path: string
      }
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(r.storage_path, 3600)
      return {
        id: r.id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        file_size: r.file_size,
        notes: r.notes,
        created_at: r.created_at,
        download_url: signed?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json({ documents })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents, 'manager')
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'project-documents-upload')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const formData = await req.formData()
  const projectId = String(formData.get('project_id') ?? '').trim()
  const file = formData.get('file')
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 500) || null

  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'חסר קובץ' }, { status: 400 })
  }

  const mime = file.type || 'application/octet-stream'
  const size = file.size
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'גודל קובץ לא תקין (מקסימום 15MB)' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
  }

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const originalName = file instanceof File ? file.name : 'document'
  const fileName = safeFileName(originalName)
  const storagePath = `${auth.ctx.clientId}/${projectId}/${Date.now()}-${fileName}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType: mime,
    upsert: false,
  })
  if (upErr) {
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 })
  }

  const { data: inserted, error: insErr } = await admin
    .from('project_documents')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: projectId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mime,
      file_size: size,
      notes,
      uploaded_by: auth.ctx.userId,
    })
    .select('id, file_name, mime_type, file_size, notes, created_at')
    .single()

  if (insErr) {
    await admin.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 3600)

  return NextResponse.json({
    document: {
      ...(inserted as object),
      download_url: signed?.signedUrl ?? null,
    },
  })
}

export async function DELETE(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents, 'manager')
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = deleteProjectDocumentBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: row, error: fetchErr } = await admin
    .from('project_documents')
    .select('id, storage_path')
    .eq('id', parsed.data.document_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 })
  }

  const storagePath = (row as { storage_path: string }).storage_path
  await admin.storage.from(BUCKET).remove([storagePath])
  const { error: delErr } = await admin
    .from('project_documents')
    .delete()
    .eq('id', parsed.data.document_id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
