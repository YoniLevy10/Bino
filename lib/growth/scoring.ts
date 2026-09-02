/**
 * Transparent lead scoring for Israeli property-management ICP.
 * Never invent facts — only score on provided signals.
 */
export type LeadScoreInput = {
  managesMultipleBuildings?: boolean
  relevantPmcCategory?: boolean
  operationalContactFound?: boolean
  activeWebsite?: boolean
  visibleMaintenanceOps?: boolean
  whatsappOrPublicContact?: boolean
  geographicFitIsrael?: boolean
  buildingsCountEst?: number | null
}

export type ScoreReason = {
  code: string
  points: number
  labelHe: string
}

export type LeadScoreResult = {
  score: number
  band: 'hot' | 'warm' | 'cold'
  reasons: ScoreReason[]
}

export function scoreGrowthLead(input: LeadScoreInput): LeadScoreResult {
  const reasons: ScoreReason[] = []

  if (input.managesMultipleBuildings || (input.buildingsCountEst != null && input.buildingsCountEst >= 2)) {
    reasons.push({
      code: 'multi_building',
      points: 30,
      labelHe: 'מנהלים מספר בניינים / מתחמים',
    })
  }
  if (input.relevantPmcCategory) {
    reasons.push({
      code: 'pmc_category',
      points: 20,
      labelHe: 'קטגוריית ניהול נכסים / אחזקת מבנים',
    })
  }
  if (input.operationalContactFound) {
    reasons.push({
      code: 'ops_contact',
      points: 15,
      labelHe: 'נמצא איש קשר תפעולי',
    })
  }
  if (input.activeWebsite) {
    reasons.push({
      code: 'website',
      points: 10,
      labelHe: 'אתר פעיל',
    })
  }
  if (input.visibleMaintenanceOps) {
    reasons.push({
      code: 'maintenance_ops',
      points: 10,
      labelHe: 'עדות לפעילות אחזקה',
    })
  }
  if (input.whatsappOrPublicContact) {
    reasons.push({
      code: 'public_contact',
      points: 10,
      labelHe: 'טלפון / וואטסאפ / מייל ציבורי',
    })
  }
  if (input.geographicFitIsrael !== false) {
    reasons.push({
      code: 'geo_il',
      points: 5,
      labelHe: 'התאמה גאוגרפית לישראל',
    })
  }

  const score = Math.min(
    100,
    reasons.reduce((s, r) => s + r.points, 0)
  )
  const band: LeadScoreResult['band'] = score >= 80 ? 'hot' : score >= 60 ? 'warm' : 'cold'
  return { score, band, reasons }
}
