/**
 * Platform kill-switch for building finance (Wave 3).
 * Building finance is a core product feature (not a paid addon).
 * Set BUILDING_FINANCE_ENABLED=false to disable for all tenants.
 */
export function isBuildingFinancePlatformEnabled(): boolean {
  const raw = process.env.BUILDING_FINANCE_ENABLED
  if (raw === undefined || raw === '') return true
  return raw !== '0' && raw.toLowerCase() !== 'false'
}
