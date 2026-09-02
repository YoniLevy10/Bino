/**
 * Legal-first lead discovery intents — public search only.
 * No LinkedIn bots, no CAPTCHA bypass, no fabricated enrichment.
 */
export const PMC_SEARCH_INTENTS_HE = [
  'חברת ניהול ואחזקה בניינים',
  'ניהול בתים משותפים',
  'חברת ניהול נכסים',
  'אחזקת מבנים',
  'חברת ניהול בניינים',
  'ניהול ואחזקת מבנים מגורים',
] as const

export type DiscoveredCompanyStub = {
  name: string
  website?: string | null
  city?: string | null
  phone?: string | null
  source: string
  sourceUrl?: string | null
  confidence: number
}

/**
 * Placeholder for future public-directory / search adapters.
 * Returns empty until a real public source adapter is wired — never invents companies.
 */
export async function discoverCompaniesFromPublicSources(_opts: {
  intents?: string[]
  limit?: number
}): Promise<DiscoveredCompanyStub[]> {
  return []
}
