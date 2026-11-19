import { NextResponse } from 'next/server'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { deleteProjectDocumentBodySchema, moveProjectDocumentBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { removeDurableStorageObjects } from '@/lib/storage-purge'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const BUCKET = 'project-documents' as const
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

  const url = new URL(req.url)
  const projectId = url.searchParams.get('project_id')?.trim() || null
  const folderId = url.searchParams.get('folder_id')?.trim() || null

  if (!projectId && !folderId) {
    return NextResponse.json({ error: 'חסר project_id או folder_id' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  let resolvedProjectId = projectId
  let resolvedFolderId = folderId

  if (folderId) {
    const { data: folder } = await admin
      .from('document_folders')
      .select('id, project_id')
      .eq('id', folderId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!folder) return NextResponse.json({ error: 'תיקיה לא נמצאה' }, { status: 404 })
    resolvedFolderId = (folder as { id: string }).id
    const folderProjectId = (folder as { project_id: string | null }).project_id
    if (projectId && folderProjectId && projectId !== folderProjectId) {
      return NextResponse.json({ error: 'תיקיה לא שייכת לפרויקט' }, { status: 400 })
    }
    if (!resolvedProjectId) resolvedProjectId = folderProjectId
  } else if (projectId) {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  let query = admin
    .from('project_documents')
    .select('id, file_name, mime_type, file_size, notes, created_at, storage_path, folder_id, project_id')
    .eq('client_id', auth.ctx.clientId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (resolvedFolderId) {
    query = query.eq('folder_id', resolvedFolderId)
  } else if (resolvedProjectId) {
    query = query.eq('project_id', resolvedProjectId)
  }

  const { data: rows, error } = await query

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
        folder_id: string | null
        project_id: string | null
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
        folder_id: r.folder_id,
        project_id: r.project_id,
        download_url: signed?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json({ documents })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'project-documents-upload')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const formData = await req.formData()
  let projectId = String(formData.get('project_id') ?? '').trim() || null
  const folderId = String(formData.get('folder_id') ?? '').trim() || null
  const file = formData.get('file')
  const notes = String(formData.get('notes') ?? '').trim().slice(0, 500) || null

  if (!projectId && !folderId) {
    return NextResponse.json({ error: 'חסר project_id או folder_id' }, { status: 400 })
  }
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'חסר קובץ' }, { status: 400 })
  }

  let resolvedFolderId: string | null = folderId
  if (folderId) {
    const { data: folder } = await admin
      .from('document_folders')
      .select('id, project_id')
      .eq('id', folderId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!folder) return NextResponse.json({ error: 'תיקיה לא נמצאה' }, { status: 404 })
    resolvedFolderId = (folder as { id: string }).id
    const folderProjectId = (folder as { project_id: string | null }).project_id
    if (projectId && folderProjectId && projectId !== folderProjectId) {
      return NextResponse.json({ error: 'תיקיה לא שייכת לפרויקט' }, { status: 400 })
    }
    if (!projectId) projectId = folderProjectId
  }

  if (projectId) {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()
    if (!project) return NextResponse.json({ error: 'פרויקט לא נמצא' }, { status: 404 })
  }

  const mime = file.type || 'application/octet-stream'
  const size = file.size
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'גודל קובץ לא תקין (מקסימום 15MB)' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
  }

  const originalName = file instanceof File ? file.name : 'document'
  const fileName = safeFileName(originalName)
  const scope = projectId ?? (resolvedFolderId ? `folder-${resolvedFolderId}` : 'unscoped')
  const storagePath = `${auth.ctx.clientId}/${scope}/${Date.now()}-${fileName}`
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
      folder_id: resolvedFolderId,
      file_name: fileName,
      storage_path: storagePath,
      mime_type: mime,
      file_size: size,
      notes,
      uploaded_by: auth.ctx.userId,
    })
    .select('id, file_name, mime_type, file_size, notes, created_at, folder_id, project_id')
    .single()

  if (insErr) {
    await removeDurableStorageObjects(admin, BUCKET, [storagePath], 'upload_rollback')
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

export async function PATCH(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents, { write: true })
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = moveProjectDocumentBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'project-documents-move')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { document_id: documentId, folder_id: folderId } = parsed.data

  const { data: doc, error: docErr } = await admin
    .from('project_documents')
    .select('id, folder_id, project_id, storage_path')
    .eq('id', documentId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (docErr || !doc) {
    return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 })
  }

  if ((doc as { folder_id: string | null }).folder_id === folderId) {
    return NextResponse.json({ ok: true, document: { id: documentId, folder_id: folderId } })
  }

  const { data: folder, error: folderErr } = await admin
    .from('document_folders')
    .select('id, project_id')
    .eq('id', folderId)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (folderErr || !folder) {
    return NextResponse.json({ error: 'תיקיה לא נמצאה' }, { status: 404 })
  }

  const folderProjectId = (folder as { project_id: string | null }).project_id
  const docProjectId = (doc as { project_id: string | null }).project_id
  if (docProjectId && folderProjectId && docProjectId !== folderProjectId) {
    return NextResponse.json({ error: 'המסמך והתיקיה לא שייכים לאותו בניין' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await admin
    .from('project_documents')
    .update({
      folder_id: folderId,
      project_id: folderProjectId ?? docProjectId,
    })
    .eq('id', documentId)
    .eq('client_id', auth.ctx.clientId)
    .select('id, file_name, mime_type, file_size, notes, created_at, folder_id, project_id, storage_path')
    .single()

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  const row = updated as { storage_path: string }
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(row.storage_path, 3600)

  return NextResponse.json({
    document: {
      ...(updated as object),
      download_url: signed?.signedUrl ?? null,
    },
  })
}

export async function DELETE(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.project_documents)
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
  // DB row delete always proceeds; Storage bytes are purged only when
  // STORAGE_ALLOW_PURGE=true (default off — see docs/STORAGE_BACKUP_POLICY_2026-10-03.md).
  const purge = await removeDurableStorageObjects(admin, BUCKET, [storagePath], 'user_delete')
  const { error: delErr } = await admin
    .from('project_documents')
    .delete()
    .eq('id', parsed.data.document_id)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    storage_purged: purge.ok && purge.purged === true,
    storage_purge_skipped: purge.ok && 'skipped' in purge ? purge.skipped : false,
  })
}
