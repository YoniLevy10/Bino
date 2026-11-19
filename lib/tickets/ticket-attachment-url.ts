import type { SupabaseClient } from '@supabase/supabase-js'

const SIGNED_URL_TTL_SEC = 3600

type AttachmentWithPath = {
  file_url?: string | null
}

/** Resolve time-limited signed URLs for private ticket-attachments bucket. */
export async function withSignedAttachmentUrls<T extends AttachmentWithPath>(
  supabase: SupabaseClient,
  attachments: T[]
): Promise<Array<T & { signed_url: string | null }>> {
  return Promise.all(
    attachments.map(async (attachment) => {
      const filePath = attachment.file_url?.trim()
      if (!filePath) return { ...attachment, signed_url: null }

      const { data, error } = await supabase.storage
        .from('ticket-attachments')
        .createSignedUrl(filePath, SIGNED_URL_TTL_SEC)

      return { ...attachment, signed_url: error || !data?.signedUrl ? null : data.signedUrl }
    })
  )
}

/** Server-side signed URL (worker portal, webhooks). */
export async function createServerSignedAttachmentUrl(
  admin: SupabaseClient,
  filePath: string
): Promise<string | null> {
  const path = filePath.trim()
  if (!path) return null
  const { data, error } = await admin.storage
    .from('ticket-attachments')
    .createSignedUrl(path, SIGNED_URL_TTL_SEC)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

type SignedPhotoInput = { file_url: string; mime_type: string | null }
type SignedPhotoOut = { public_url: string; mime_type: string | null }

/**
 * Sign many attachment paths in parallel (site tours / worker tours).
 * Caps per-group via `maxPerGroup` so list endpoints stay bounded.
 */
export async function signTourPhotosParallel(
  admin: SupabaseClient,
  photosByGroup: Map<string, SignedPhotoInput[]>,
  maxPerGroup = 6
): Promise<Map<string, SignedPhotoOut[]>> {
  const jobs: { groupId: string; file_url: string; mime_type: string | null }[] = []
  for (const [groupId, list] of photosByGroup) {
    for (const ph of list.slice(0, maxPerGroup)) {
      jobs.push({ groupId, file_url: ph.file_url, mime_type: ph.mime_type })
    }
  }
  const settled = await Promise.all(
    jobs.map(async (job) => {
      const url = await createServerSignedAttachmentUrl(admin, job.file_url)
      return url ? { groupId: job.groupId, public_url: url, mime_type: job.mime_type } : null
    })
  )
  const out = new Map<string, SignedPhotoOut[]>()
  for (const row of settled) {
    if (!row) continue
    const list = out.get(row.groupId) || []
    list.push({ public_url: row.public_url, mime_type: row.mime_type })
    out.set(row.groupId, list)
  }
  return out
}
