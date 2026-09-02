/**
 * Deterministic optimization rules + AI-ready recommendation records.
 * Thresholds configurable; AI only explains — never spends.
 */
export type PerfInput = {
  spend: number
  leads: number
  clicks: number
  impressions: number
  ctr: number | null
  frequency: number | null
  targetCpl: number | null
  minSpend: number
  minLeads: number
  cplMultiplier: number
}

export type RuleHit = {
  ruleCode: string
  severity: 'info' | 'warn' | 'critical'
  title: string
  explanation: string
  proposedAction: string
  requiresApproval: boolean
}

export function evaluateOptimizationRules(p: PerfInput): RuleHit[] {
  const hits: RuleHit[] = []
  const cpl = p.leads > 0 ? p.spend / p.leads : null

  if (p.spend < p.minSpend) {
    hits.push({
      ruleCode: 'INSUFFICIENT_DATA',
      severity: 'info',
      title: 'אין מספיק דאטה לשיפוט',
      explanation: `הוצאה ${p.spend} מתחת לסף ${p.minSpend}.`,
      proposedAction: 'המשך איסוף דאטה — אל תשנה תקציב עדיין',
      requiresApproval: false,
    })
    return hits
  }

  if (p.spend >= p.minSpend && p.leads === 0) {
    hits.push({
      ruleCode: 'SPEND_NO_LEADS',
      severity: 'critical',
      title: 'הוצאה בלי לידים',
      explanation: `הוצאה ${p.spend} ללא לידים.`,
      proposedAction: 'מועמד להשהיית מודעות/קמפיין (דורש מדיניות SUPERVISED)',
      requiresApproval: true,
    })
  }

  if (
    cpl != null &&
    p.targetCpl != null &&
    p.leads >= p.minLeads &&
    cpl > p.targetCpl * p.cplMultiplier
  ) {
    hits.push({
      ruleCode: 'CPL_ABOVE_TARGET',
      severity: 'warn',
      title: 'CPL מעל היעד',
      explanation: `CPL ${cpl.toFixed(1)} מעל יעד ${p.targetCpl} × ${p.cplMultiplier}.`,
      proposedAction: 'שקול השהיה או החלפת זווית קריאייטיב',
      requiresApproval: true,
    })
  }

  if (
    cpl != null &&
    p.targetCpl != null &&
    p.leads >= p.minLeads &&
    cpl < p.targetCpl * 0.7
  ) {
    hits.push({
      ruleCode: 'CPL_BELOW_TARGET',
      severity: 'info',
      title: 'CPL נמוך מהיעד',
      explanation: `CPL ${cpl.toFixed(1)} משמעותית מתחת ליעד.`,
      proposedAction: 'מועמד להעלאת תקציב (דורש אישור)',
      requiresApproval: true,
    })
  }

  if (p.ctr != null && p.ctr >= 1.5 && p.clicks >= 40 && p.leads / p.clicks < 0.05) {
    hits.push({
      ruleCode: 'STRONG_CTR_WEAK_CONV',
      severity: 'warn',
      title: 'CTR חזק / המרה חלשה',
      explanation: 'מודעות מושכות קליקים אך דף הנחיתה/ההצעה לא ממירים.',
      proposedAction: 'בדוק דף נחיתה והצעה — לא רק קריאייטיב',
      requiresApproval: false,
    })
  }

  if (p.ctr != null && p.ctr < 0.6 && p.impressions >= 2000) {
    hits.push({
      ruleCode: 'WEAK_CTR',
      severity: 'warn',
      title: 'CTR חלש',
      explanation: `CTR ${p.ctr.toFixed(2)}% נמוך אחרי חשיפה מספקת.`,
      proposedAction: 'בדוק הוק / קריאייטיב / זווית',
      requiresApproval: false,
    })
  }

  if (p.frequency != null && p.frequency >= 3.5 && p.ctr != null && p.ctr < 0.8) {
    hits.push({
      ruleCode: 'CREATIVE_FATIGUE',
      severity: 'warn',
      title: 'חשד לעייפות קריאייטיב',
      explanation: `Frequency ${p.frequency.toFixed(1)} עם CTR יורד/חלש.`,
      proposedAction: 'ייצר וריאציות חדשות לזווית המנצחת',
      requiresApproval: false,
    })
  }

  // Decision-matrix style: high spend + declining efficiency → rotate creative before budget up
  if (p.spend >= p.minSpend * 2 && p.leads > 0 && cpl != null && p.targetCpl != null && cpl > p.targetCpl) {
    hits.push({
      ruleCode: 'ROTATE_BEFORE_SCALE',
      severity: 'warn',
      title: 'אל תגדיל תקציב לפני רוטציית קריאייטיב',
      explanation: 'CPL מעל יעד אחרי הוצאה מספקת — קודם זווית/הוק חדשים, לא scale.',
      proposedAction: 'הכן batch קריאייטיב חדש + בקש אישור — אל תעלה תקציב',
      requiresApproval: true,
    })
  }

  return hits
}
