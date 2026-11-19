import { describe, expect, it } from 'vitest'
import {
  pullBuildingBankTransactions,
  scraperFixtureRows,
} from '@/lib/bank-match/scraper-adapter'

describe('scraper adapter', () => {
  it('refuses live pull (scraping removed from product)', async () => {
    process.env.BUILDING_BANK_SCRAPER_SYNC_ENABLED = 'true'
    const result = await pullBuildingBankTransactions({
      clientId: 'c',
      projectId: 'p',
      provider: 'leumi',
      credentials: { username: 'x', password: 'y' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('DISABLED')
  })

  it('exposes fixture rows for dry-run', () => {
    const rows = scraperFixtureRows('proj')
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('scraper')
  })
})
