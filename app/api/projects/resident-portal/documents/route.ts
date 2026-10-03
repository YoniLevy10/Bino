import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { sanitizeId } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { removeDurableStorageObjects } from '@/lib/storage-purge'

const BUCKET = 'project-documents' as const
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED_MIME = new Set(['application/pdf'])

function safeFileName(name: string): string {
  return name.replace(/[^\w.\-()\u0590-\u05FF ]+/g, '_').slice(0, 180) || 'document.pdf'
}

/** List documents published to the resident portal for a project. */
export async function GET(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const projectId = sanitizeId(new URL(req.url).searchParams.get('project_id'))
  if (!projectId) {
    return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  }

  const { data: project } = await auth.ctx.admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const { data: rows, error } = await auth.ctx.admin
    .from('project_documents')
    .select(
      'id, file_name, mime_type, file_size, notes, category, visibility, published_at, created_at, storage_path'
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', projectId)
    .eq('visibility', 'residents')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })

  if (error) {
    console.error('[portal/documents GET]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const documents = await Promise.all(
    (rows ?? []).map(async (row) => {
      const r = row as {
        id: string
        file_name: string
        mime_type: string | null
        file_size: number | null
        notes: string | null
        category: string | null
        visibility: string
        published_at: string | null
        created_at: string
        storage_path: string
      }
      const { data: signed } = await auth.ctx.admin.storage
        .from(BUCKET)
        .createSignedUrl(r.storage_path, 3600)
      return {
        id: r.id,
        file_name: r.file_name,
        mime_type: r.mime_type,
        file_size: r.file_size,
        notes: r.notes,
        category: r.category,
        visibility: r.visibility,
        published_at: r.published_at,
        created_at: r.created_at,
        download_url: signed?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json({ documents })
}

/**
 * Upload a PDF and publish it immediately to the resident portal
 * (visibility=residents). Does not require the paid project_documents addon.
 */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const rl = await checkAuthenticatedPostRouteLimit(
    auth.ctx.admin,
    auth.ctx.userId,
    'resident-portal-documents-upload'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const projectId = sanitizeId(String(formData.get('project_id') ?? ''))
  const file = formData.get('file')
  const notesRaw = String(formData.get('notes') ?? '').trim().slice(0, 500)
  const categoryRaw = String(formData.get('category') ?? '').trim().slice(0, 80)

  if (!projectId) return NextResponse.json({ error: 'חסר project_id' }, { status: 400 })
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'חסר קובץ' }, { status: 400 })
  }

  const originalName = file instanceof File ? file.name : 'document.pdf'
  const mime = (file.type || '').toLowerCase()
  const nameLooksPdf = originalName.toLowerCase().endsWith('.pdf')
  const mimeOk =
    !mime ||
    mime === 'application/octet-stream' ||
    ALLOWED_MIME.has(mime)
  if (!nameLooksPdf || !mimeOk) {
    return NextResponse.json({ error: 'יש להעלות קובץ PDF בלבד' }, { status: 400 })
  }

  const size = file.size
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'גודל קובץ לא תקין (מקסימום 15MB)' }, { status: 400 })
  }

  const { data: project } = await auth.ctx.admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })

  const fileName = safeFileName(originalName.endsWith('.pdf') ? originalName : `${originalName}.pdf`)
  const storagePath = `${auth.ctx.clientId}/${projectId}/portal-${Date.now()}-${fileName}`
  const buf = Buffer.from(await file.arrayBuffer())
  const contentType = 'application/pdf'

  const { error: upErr } = await auth.ctx.admin.storage.from(BUCKET).upload(storagePath, buf, {
    contentType,
    upsert: false,
  })
  if (upErr) {
    console.error('[portal/documents upload]', upErr.message)
    return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 })
  }

  const publishedAt = new Date().toISOString()
  const { data: inserted, error: insErr } = await auth.ctx.admin
    .from('project_documents')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: projectId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: contentType,
      file_size: size,
      notes: notesRaw || null,
      category: categoryRaw || null,
      uploaded_by: auth.ctx.userId,
      visibility: 'residents',
      published_at: publishedAt,
    })
    .select('id, file_name, mime_type, file_size, notes, category, visibility, published_at, created_at')
    .single()

  if (insErr || !inserted) {
    await removeDurableStorageObjects(auth.ctx.admin, BUCKET, [storagePath], 'upload_rollback')
    console.error('[portal/documents insert]', insErr?.message)
    return NextResponse.json({ error: insErr?.message || 'שמירה נכשלה' }, { status: 500 })
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'portal_document_uploaded',
    entityType: 'project_document',
    entityId: (inserted as { id: string }).id,
    newValues: {
      file_name: fileName,
      project_id: projectId,
      visibility: 'residents',
    },
  })

  const { data: signed } = await auth.ctx.admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600)

  return NextResponse.json({
    ok: true,
    document: {
      ...(inserted as object),
      download_url: signed?.signedUrl ?? null,
    },
  })
}

/** Remove a portal document from residents; Storage purge is gated (see storage-purge). */
export async function DELETE(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let body: { document_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const documentId = sanitizeId(body.document_id)
  if (!documentId) {
    return NextResponse.json({ error: 'חסר document_id' }, { status: 400 })
  }

  const { data: row, error: fetchErr } = await auth.ctx.admin
    .from('project_documents')
    .select('id, storage_path, visibility, file_name')
    .eq('id', documentId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 })
  }

  const storagePath = (row as { storage_path: string }).storage_path
  const purge = await removeDurableStorageObjects(
    auth.ctx.admin,
    BUCKET,
    [storagePath],
    'user_delete'
  )
  const { error: delErr } = await auth.ctx.admin
    .from('project_documents')
    .delete()
    .eq('id', documentId)
    .eq('client_id', auth.ctx.clientId)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'portal_document_deleted',
    entityType: 'project_document',
    entityId: documentId,
    oldValues: {
      file_name: (row as { file_name?: string }).file_name,
      visibility: (row as { visibility?: string }).visibility,
      storage_purged: purge.ok && purge.purged === true,
    },
  })

  return NextResponse.json({
    ok: true,
    storage_purged: purge.ok && purge.purged === true,
    storage_purge_skipped: purge.ok && 'skipped' in purge ? purge.skipped : false,
  })
}
