import { NextResponse } from 'next/server'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { sanitizeId } from '@/lib/api-validation'
import { logAudit } from '@/lib/audit'

/** Publish / unpublish an existing project document to the resident portal. */
export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  let body: { document_id?: unknown; publish?: unknown; building_id?: unknown; category?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }

  const documentId = sanitizeId(body.document_id)
  if (!documentId) {
    return NextResponse.json({ error: 'חסר document_id' }, { status: 400 })
  }
  const publish = body.publish !== false
  const buildingId = sanitizeId(body.building_id)
  const category = typeof body.category === 'string' ? body.category.trim() || null : undefined

  const patch: Record<string, unknown> = publish
    ? {
        visibility: 'residents',
        published_at: new Date().toISOString(),
      }
    : {
        visibility: 'internal',
        published_at: null,
      }
  if (buildingId !== null) patch.building_id = buildingId || null
  if (category !== undefined) patch.category = category

  const { data, error } = await auth.ctx.admin
    .from('project_documents')
    .update(patch)
    .eq('id', documentId)
    .eq('client_id', auth.ctx.clientId)
    .select('id, visibility, published_at, building_id, category, file_name')
    .maybeSingle()

  if (error) {
    console.error('[portal/documents/publish]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'מסמך לא נמצא' }, { status: 404 })

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: publish ? 'portal_document_published' : 'portal_document_unpublished',
    entityType: 'project_document',
    entityId: documentId,
    newValues: patch,
  })

  return NextResponse.json({ ok: true, document: data })
}
