import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canPurgeDurableStorage,
  isStoragePurgeEnabled,
  removeDurableStorageObjects,
} from '@/lib/storage-purge'

describe('storage-purge policy', () => {
  afterEach(() => {
    delete process.env.STORAGE_ALLOW_PURGE
    vi.restoreAllMocks()
  })

  it('allows upload_rollback without env flag', () => {
    expect(canPurgeDurableStorage('upload_rollback')).toBe(true)
    expect(isStoragePurgeEnabled()).toBe(false)
  })

  it('blocks user_delete / admin_purge unless STORAGE_ALLOW_PURGE=true', () => {
    expect(canPurgeDurableStorage('user_delete')).toBe(false)
    expect(canPurgeDurableStorage('admin_purge')).toBe(false)
    process.env.STORAGE_ALLOW_PURGE = 'true'
    expect(canPurgeDurableStorage('user_delete')).toBe(true)
    expect(canPurgeDurableStorage('admin_purge')).toBe(true)
  })

  it('skips remove for user_delete when purge flag is off', async () => {
    const remove = vi.fn()
    const admin = {
      storage: { from: () => ({ remove }) },
    } as never

    const result = await removeDurableStorageObjects(
      admin,
      'project-documents',
      ['client/proj/doc.pdf'],
      'user_delete'
    )

    expect(result).toEqual({
      ok: true,
      purged: false,
      skipped: true,
      reason: 'STORAGE_ALLOW_PURGE is not true',
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('removes objects for upload_rollback even when flag is off', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null })
    const admin = {
      storage: { from: () => ({ remove }) },
    } as never

    const result = await removeDurableStorageObjects(
      admin,
      'ticket-attachments',
      ['ticket-id/file.jpg'],
      'upload_rollback'
    )

    expect(result).toEqual({ ok: true, purged: true })
    expect(remove).toHaveBeenCalledWith(['ticket-id/file.jpg'])
  })
})
