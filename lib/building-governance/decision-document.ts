import type { SupabaseClient } from '@supabase/supabase-js'

export type DecisionDocumentLite = {
  id: string
  file_name: string
  mime_type: string | null
  file_size: number | null
}

/**
 * Validate that a project_documents row belongs to the same tenant building
 * as the decision (client_id + project_id).
 */
export async function assertDocumentForProject(
  admin: SupabaseClient,
  opts: { documentId: string; clientId: string; projectId: string }
): Promise<{ ok: true; doc: DecisionDocumentLite } | { ok: false; error: string; status: number }> {
  const { data, error } = await admin
    .from('project_documents')
    .select('id, file_name, mime_type, file_size, client_id, project_id')
    .eq('id', opts.documentId)
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'שגיאה בטעינת מסמך', status: 500 }
  }
  if (!data) {
    return { ok: false, error: 'מסמך לא נמצא בבניין זה', status: 404 }
  }

  return {
    ok: true,
    doc: {
      id: (data as DecisionDocumentLite).id,
      file_name: (data as DecisionDocumentLite).file_name,
      mime_type: (data as DecisionDocumentLite).mime_type,
      file_size: (data as DecisionDocumentLite).file_size,
    },
  }
}

/**
 * Signed URL for a decision-attached document.
 * Access is gated by decision membership (client/project), not residents visibility —
 * so managers can attach an archive PDF without publishing it to the general docs list.
 */
export async function createDecisionDocumentSignedUrl(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    documentId: string
    expiresIn?: number
  }
): Promise<{ url: string; expiresIn: number; file_name: string; mime_type: string | null }> {
  const { data: doc, error } = await admin
    .from('project_documents')
    .select('id, file_name, mime_type, storage_path, client_id, project_id')
    .eq('id', opts.documentId)
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!doc) throw new Error('מסמך לא נמצא')

  const expiresIn = opts.expiresIn ?? 120
  const { data: signed, error: sErr } = await admin.storage
    .from('project-documents')
    .createSignedUrl((doc as { storage_path: string }).storage_path, expiresIn)

  if (sErr || !signed?.signedUrl) {
    throw new Error(sErr?.message || 'יצירת קישור נכשלה')
  }

  return {
    url: signed.signedUrl,
    expiresIn,
    file_name: (doc as { file_name: string }).file_name,
    mime_type: (doc as { mime_type: string | null }).mime_type,
  }
}
