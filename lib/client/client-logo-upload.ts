import type { SupabaseClient } from '@supabase/supabase-js'

export const CLIENT_LOGOS_BUCKET = 'client-logos'
export const CLIENT_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const CLIENT_LOGO_ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/**
 * Ensure the public client-logos bucket exists (idempotent).
 * Needed when migration 058 was not applied on the remote project.
 */
export async function ensureClientLogosBucket(admin: SupabaseClient): Promise<void> {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets()
  if (listErr) {
    // Best-effort — upload will surface a clearer error if the bucket is still missing.
    return
  }
  const exists = (buckets || []).some((b) => b.id === CLIENT_LOGOS_BUCKET || b.name === CLIENT_LOGOS_BUCKET)
  if (exists) return

  await admin.storage.createBucket(CLIENT_LOGOS_BUCKET, {
    public: true,
    fileSizeLimit: CLIENT_LOGO_MAX_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  })
}

function mimeFromFileName(fileName: string): string | null {
  const lower = fileName.trim().toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return null
}

function mimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/** Browsers (esp. Windows) often send empty or generic MIME — infer from name + magic bytes. */
export function resolveClientLogoMime(
  file: Blob,
  fileName?: string | null,
  buf?: Buffer
): string | null {
  const declared = file.type?.trim()
  if (declared && declared !== 'application/octet-stream' && CLIENT_LOGO_ALLOWED_MIMES.has(declared)) {
    return declared
  }
  const fromName = fileName ? mimeFromFileName(fileName) : null
  if (fromName) return fromName
  if (buf) return mimeFromMagicBytes(buf)
  return null
}

export function clientLogoExtension(mime: string): 'png' | 'jpg' | 'webp' {
  if (mime.includes('png')) return 'png'
  if (mime.includes('jpeg')) return 'jpg'
  return 'webp'
}

export function validateClientLogoFile(size: number, mime: string | null): string | null {
  if (!mime || !CLIENT_LOGO_ALLOWED_MIMES.has(mime)) {
    return 'סוג קובץ לא נתמך (PNG/JPEG/WEBP בלבד)'
  }
  if (size <= 0 || size > CLIENT_LOGO_MAX_BYTES) {
    return 'הקובץ גדול מדי (מקסימום 2MB)'
  }
  return null
}
