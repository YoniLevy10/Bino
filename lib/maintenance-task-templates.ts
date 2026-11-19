/**
 * Built-in building maintenance plan templates (Hebrew).
 */
import type { MaintenanceCadence } from '@/lib/maintenance-cadence'
import type { MaintenanceChecklistItem } from '@/lib/maintenance-checklist'

export type MaintenanceTaskTemplate = {
  key: string
  title: string
  description: string
  cadence: MaintenanceCadence
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  checklist: string[]
  estimated_minutes: number
}

/** Default 6-task plan for a building — fills morning board with colors. */
export const BUILDING_MAINTENANCE_TEMPLATES: MaintenanceTaskTemplate[] = [
  {
    key: 'stairs_weekly',
    title: 'ניקוי חדר מדרגות',
    description: 'ניקוי שבועי של חדרי מדרגות ולובי',
    cadence: 'weekly',
    priority: 'MEDIUM',
    checklist: ['ניקוי מדרגות', 'ריקון פחים', 'בדיקת תאורה'],
    estimated_minutes: 45,
  },
  {
    key: 'lobby_weekly',
    title: 'בדיקת לובי וכניסה',
    description: 'סיור קצר בכניסה, דלתות ואינטרקום',
    cadence: 'weekly',
    priority: 'MEDIUM',
    checklist: ['דלת כניסה', 'אינטרקום', 'ניקיון כניסה'],
    estimated_minutes: 20,
  },
  {
    key: 'pump_monthly',
    title: 'בדיקת משאבת מים / לחץ',
    description: 'בדיקה חודשית של חדר משאבות',
    cadence: 'monthly',
    priority: 'HIGH',
    checklist: ['רעשים חריגים', 'דליפות', 'מד לחץ'],
    estimated_minutes: 30,
  },
  {
    key: 'elevator_monthly',
    title: 'סיור מעלית ומכונת מעלית',
    description: 'בדיקה חזותית + תיעוד חריגות',
    cadence: 'monthly',
    priority: 'HIGH',
    checklist: ['תא נוסעים', 'כפתורים', 'חדר מכונות'],
    estimated_minutes: 25,
  },
  {
    key: 'roof_quarterly',
    title: 'בדיקת גג וניקוזים',
    description: 'סיור רבעוני לגג ומרזבים',
    cadence: 'quarterly',
    priority: 'MEDIUM',
    checklist: ['מרזבים פנויים', 'אטמים', 'צילום חריגות'],
    estimated_minutes: 40,
  },
  {
    key: 'fire_yearly',
    title: 'בדיקת מערכות בטיחות אש',
    description: 'בדיקה שנתית / תיאום ספק',
    cadence: 'yearly',
    priority: 'HIGH',
    checklist: ['גלאי עשן', 'מטפים', 'יציאות חירום'],
    estimated_minutes: 90,
  },
]

export function checklistFromTexts(texts: string[]): MaintenanceChecklistItem[] {
  return texts.map((text, i) => ({
    id: `c${i + 1}`,
    text,
    done_at: null,
  }))
}

/** First due dates staggered from «now» so the morning board is not empty. */
export function firstDueIsoForCadence(cadence: MaintenanceCadence, now = new Date()): string {
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  switch (cadence) {
    case 'weekly':
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      break
    case 'monthly':
      d.setDate(d.getDate() + 7)
      d.setHours(10, 0, 0, 0)
      break
    case 'quarterly':
      d.setDate(d.getDate() + 21)
      d.setHours(10, 0, 0, 0)
      break
    case 'yearly':
      d.setMonth(d.getMonth() + 1)
      d.setHours(10, 0, 0, 0)
      break
    default:
      d.setDate(d.getDate() + 2)
      d.setHours(9, 0, 0, 0)
  }
  return d.toISOString()
}
