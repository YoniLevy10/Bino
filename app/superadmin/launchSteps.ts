/** Ordered steps for the full client launch wizard. */
export const LAUNCH_WIZARD_STEPS = [
  { id: 1, key: 'identity', title: 'זהות ומנהל' },
  { id: 2, key: 'buildings', title: 'בניינים' },
  { id: 3, key: 'residents', title: 'דיירים' },
  { id: 4, key: 'workers', title: 'עובדים' },
  { id: 5, key: 'whatsapp', title: 'WhatsApp ו-SMS' },
  { id: 6, key: 'grow', title: 'גבייה Grow' },
  { id: 7, key: 'financy', title: 'בנק Financy' },
  { id: 8, key: 'palgate', title: 'חניון PalGate' },
  { id: 9, key: 'branding', title: 'מיתוג ותפריט' },
  { id: 10, key: 'done', title: 'מוכן ובדיקות' },
] as const

export type LaunchWizardStepId = (typeof LAUNCH_WIZARD_STEPS)[number]['id']

export function clampLaunchStep(raw: number | null | undefined): LaunchWizardStepId {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1
  if (n < 1) return 1
  if (n > 10) return 10
  return n as LaunchWizardStepId
}
