import { describe, expect, it, vi, afterEach } from 'vitest'
import { FETCH_TIMEOUT_USER_MESSAGE } from '@/lib/fetch-with-timeout'

vi.mock('@/lib/fetch-with-timeout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fetch-with-timeout')>()
  return {
    ...actual,
    fetchWithTimeout: vi.fn(),
  }
})

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { whatsappUiMutate } from '@/lib/whatsapp-ui-fetch'

describe('whatsappUiMutate', () => {
  afterEach(() => {
    vi.mocked(fetchWithTimeout).mockReset()
  })

  it('retries once after client timeout', async () => {
    vi.mocked(fetchWithTimeout)
      .mockRejectedValueOnce(new Error(FETCH_TIMEOUT_USER_MESSAGE))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const res = await whatsappUiMutate('/api/whatsapp/reply-resident', { method: 'POST' })
    expect(res.ok).toBe(true)
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2)
  })
})
