import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Durable Storage buckets that hold customer operational memory (ticket media,
 * project docs, branding). Accidental remove() is irreversible when bucket
 * versioning is DISABLED and DB backups do not include object bytes.
 *
 * Set STORAGE_ALLOW_PURGE=true in the server env to allow intentional purge of
 * already-committed objects (user/admin delete). Upload rollbacks (failed DB
 * insert after a successful upload) always use reason 'upload_rollback' and
 * are allowed without the flag.
 */
export const DURABLE_STORAGE_BUCKETS = [
  'ticket-attachments',
  'project-documents',
  'client-logos',
] as const

export type DurableStorageBucket = (typeof DURABLE_STORAGE_BUCKETS)[number]

export type StoragePurgeReason = 'upload_rollback' | 'user_delete' | 'admin_purge'

export type StoragePurgeResult =
  | { ok: true; purged: true }
  | { ok: true; purged: false; skipped: true; reason: string }
  | { ok: false; error: string }

export function isStoragePurgeEnabled(): boolean {
  return process.env.STORAGE_ALLOW_PURGE === 'true'
}

export function canPurgeDurableStorage(reason: StoragePurgeReason): boolean {
  if (reason === 'upload_rollback') return true
  return isStoragePurgeEnabled()
}

/**
 * Remove objects from a durable bucket only when policy allows.
 * Returns skipped (not an error) when purge is gated off — caller should still
 * soft-delete / hard-delete DB metadata as appropriate.
 */
export async function removeDurableStorageObjects(
  admin: SupabaseClient,
  bucket: DurableStorageBucket,
  paths: string[],
  reason: StoragePurgeReason
): Promise<StoragePurgeResult> {
  const cleaned = [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
  if (cleaned.length === 0) return { ok: true, purged: true }

  if (!canPurgeDurableStorage(reason)) {
    console.warn('[storage-purge] skipped durable object remove', {
      bucket,
      reason,
      pathCount: cleaned.length,
      hint: 'Set STORAGE_ALLOW_PURGE=true to permanently delete Storage objects',
    })
    return {
      ok: true,
      purged: false,
      skipped: true,
      reason: 'STORAGE_ALLOW_PURGE is not true',
    }
  }

  const { error } = await admin.storage.from(bucket).remove(cleaned)
  if (error) {
    console.error('[storage-purge] remove failed', {
      bucket,
      reason,
      pathCount: cleaned.length,
      error: error.message,
    })
    return { ok: false, error: error.message }
  }

  return { ok: true, purged: true }
}
