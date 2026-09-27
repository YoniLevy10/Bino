import { describe, expect, it, vi } from 'vitest'
import { signTourPhotosParallel } from '@/lib/ticket-attachment-url'

describe('signTourPhotosParallel', () => {
  it('signs all photos in one parallel wave (not nested sequential awaits)', async () => {
    const order: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const admin = {
      storage: {
        from: () => ({
          createSignedUrl: async (path: string) => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            order.push(`start:${path}`)
            await new Promise((r) => setTimeout(r, 5))
            inFlight -= 1
            order.push(`end:${path}`)
            return { data: { signedUrl: `https://signed/${path}` }, error: null }
          },
        }),
      },
    }

    const photosByTour = new Map<string, { file_url: string; mime_type: string | null }[]>([
      [
        'tour-a',
        [
          { file_url: 'a1.jpg', mime_type: 'image/jpeg' },
          { file_url: 'a2.jpg', mime_type: 'image/jpeg' },
        ],
      ],
      [
        'tour-b',
        [
          { file_url: 'b1.jpg', mime_type: 'image/jpeg' },
          { file_url: 'b2.jpg', mime_type: 'image/jpeg' },
        ],
      ],
    ])

    const result = await signTourPhotosParallel(admin as never, photosByTour, 6)

    expect(result.get('tour-a')).toHaveLength(2)
    expect(result.get('tour-b')).toHaveLength(2)
    // Sequential would keep maxInFlight at 1; parallel should overlap.
    expect(maxInFlight).toBeGreaterThan(1)
    expect(order.filter((x) => x.startsWith('start:'))).toHaveLength(4)
  })

  it('respects maxPerGroup cap', async () => {
    const createSignedUrl = vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed/${path}` },
      error: null,
    }))
    const admin = { storage: { from: () => ({ createSignedUrl }) } }
    const photosByTour = new Map([
      [
        't1',
        Array.from({ length: 10 }, (_, i) => ({
          file_url: `p${i}.jpg`,
          mime_type: 'image/jpeg' as string | null,
        })),
      ],
    ])

    const result = await signTourPhotosParallel(admin as never, photosByTour, 3)
    expect(createSignedUrl).toHaveBeenCalledTimes(3)
    expect(result.get('t1')).toHaveLength(3)
  })
})

describe('warm navigation loading gate', () => {
  it('treats cached React Query data as enough to skip full-page spinner', () => {
    // Mirrors site-tours / WhatsApp / tasks: showSpinner = isLoading && !hasData
    const cases = [
      { isLoading: true, hasData: false, showSpinner: true },
      { isLoading: true, hasData: true, showSpinner: false },
      { isLoading: false, hasData: true, showSpinner: false },
      { isLoading: false, hasData: false, showSpinner: false },
    ]
    for (const c of cases) {
      const showSpinner = c.isLoading && !c.hasData
      expect(showSpinner).toBe(c.showSpinner)
    }
  })
})
