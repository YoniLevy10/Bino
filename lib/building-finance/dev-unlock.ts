/**
 * Legacy DEV unlock for building finance — no longer needed.
 * Finance / reports are core nav for every tenant; keep this helper as a
 * permanent no-op so old .env.local flags stay harmless.
 */
export function isBuildingFinanceDevUnlocked(): boolean {
  return false
}
