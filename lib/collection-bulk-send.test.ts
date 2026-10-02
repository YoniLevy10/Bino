import { describe, expect, it } from 'vitest'
import { getCollectionBulkSendRun } from '@/lib/collection-bulk-send'

describe('collection bulk send helpers', () => {
  it('returns null when run missing', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }
    const snap = await getCollectionBulkSendRun(admin as never, 'client', 'run')
    expect(snap).toBeNull()
  })

  it('maps run row to snapshot', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'run-1',
                  batch_id: 'batch-1',
                  status: 'running',
                  items_total: 10,
                  created_count: 4,
                  sent_count: 3,
                  failed_count: 1,
                  error_message: null,
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }
    const snap = await getCollectionBulkSendRun(admin as never, 'client', 'run-1')
    expect(snap).toEqual({
      run_id: 'run-1',
      batch_id: 'batch-1',
      status: 'running',
      items_total: 10,
      created: 4,
      sent: 3,
      failed: 1,
      error_message: null,
    })
  })
})
