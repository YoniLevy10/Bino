import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidentPortalMembershipView } from '@/lib/resident-portal/types'

export type ResidentDocumentView = {
  id: string
  file_name: string
  mime_type: string | null
  file_size: number | null
  notes: string | null
  category: string | null
  published_at: string | null
  created_at: string
}

export async function listPublishedDocumentsForMembership(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView
): Promise<ResidentDocumentView[]> {
  const { data: unit } = membership.unit_id
    ? await admin
        .from('project_units')
        .select('building_id')
        .eq('id', membership.unit_id)
        .maybeSingle()
    : { data: null }
  const unitBuildingId = (unit as { building_id?: string | null } | null)?.building_id ?? null

  const { data, error } = await admin
    .from('project_documents')
    .select(
      'id, file_name, mime_type, file_size, notes, category, published_at, created_at, building_id, visibility'
    )
    .eq('client_id', membership.client_id)
    .eq('project_id', membership.project_id)
    .eq('visibility', 'residents')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(`documents list failed: ${error.message}`)
  }

  type Row = ResidentDocumentView & {
    building_id: string | null
    visibility: string
  }

  return ((data ?? []) as unknown as Row[]).filter((doc) => {
    if (!doc.building_id) return true
    if (!unitBuildingId) return false
    return doc.building_id === unitBuildingId
  })
}

export async function createResidentDocumentSignedUrl(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView,
  documentId: string
): Promise<{ url: string; expiresIn: number }> {
  const { data: doc, error } = await admin
    .from('project_documents')
    .select('id, storage_path, visibility, published_at, building_id, client_id, project_id')
    .eq('id', documentId)
    .eq('client_id', membership.client_id)
    .eq('project_id', membership.project_id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!doc) throw new Error('מסמך לא נמצא')
  if (doc.visibility !== 'residents' || !doc.published_at) {
    throw new Error('המסמך אינו מפורסם לדיירים')
  }

  if (doc.building_id) {
    if (!membership.unit_id) throw new Error('אין הרשאה למסמך בניין זה')
    const { data: unit } = await admin
      .from('project_units')
      .select('building_id')
      .eq('id', membership.unit_id)
      .maybeSingle()
    if (!unit || unit.building_id !== doc.building_id) {
      throw new Error('אין הרשאה למסמך בניין זה')
    }
  }

  const expiresIn = 120
  const { data: signed, error: sErr } = await admin.storage
    .from('project-documents')
    .createSignedUrl(doc.storage_path, expiresIn)

  if (sErr || !signed?.signedUrl) {
    throw new Error(sErr?.message || 'יצירת קישור נכשלה')
  }
  return { url: signed.signedUrl, expiresIn }
}
