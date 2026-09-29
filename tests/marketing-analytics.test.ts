import { describe, expect, it, vi, afterEach } from 'vitest'
import { isValidGaMeasurementId } from '@/lib/marketing-analytics'

describe('marketing-analytics', () => {
  it('accepts GA4 measurement ids', () => {
    expect(isValidGaMeasurementId('G-ABC123XYZ')).toBe(true)
    expect(isValidGaMeasurementId('UA-123')).toBe(false)
    expect(isValidGaMeasurementId('')).toBe(false)
    expect(isValidGaMeasurementId(undefined)).toBe(false)
  })

  describe('trackMarketingLead', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.resetModules()
      // @ts-expect-error cleanup test window
      delete globalThis.window
    })

    it('no-ops when window is missing', async () => {
      vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST12345')
      const mod = await import('@/lib/marketing-analytics')
      expect(() => mod.trackMarketingEvent('page_view')).not.toThrow()
    })

    it('fires generate_lead when gtag is present', async () => {
      vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST12345')
      const gtag = vi.fn()
      // @ts-expect-error minimal browser stub for node vitest
      globalThis.window = { gtag, dataLayer: [] }
      const mod = await import('@/lib/marketing-analytics')
      mod.trackMarketingLead('whatsapp_demo', { locale: 'he' })
      expect(gtag).toHaveBeenCalledWith(
        'event',
        'generate_lead',
        expect.objectContaining({
          method: 'whatsapp_demo',
          locale: 'he',
          send_to: 'G-TEST12345',
        })
      )
    })
  })
})
