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
