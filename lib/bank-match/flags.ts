/**
 * P0 bank-match / building bank ingest flags.
 * BANK_MATCH_POC_ENABLED defaults off in production-minded deploys (explicit true to enable).
 */

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultOn
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

/** Matcher UI + CSV import + apply/unmatch APIs. */
export function isBankMatchPocEnabled(): boolean {
  return envFlag('BANK_MATCH_POC_ENABLED', false)
}

/**
 * Live bank scraping removed from product — CSV / Excel / PDF import only.
 * Always false regardless of env (legacy BUILDING_BANK_SCRAPER_* ignored).
 */
export function isBuildingBankScraperSyncEnabled(): boolean {
  return false
}

export function getBankMatchFlagSnapshot() {
  return {
    bank_match_poc: isBankMatchPocEnabled(),
    building_bank_scraper_sync: false,
    scraper_worker_configured: false,
  }
}
