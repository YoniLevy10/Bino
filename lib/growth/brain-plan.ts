/**
 * Growth Brain — convert a business goal into an approval-gated plan (Zod).
 * Deterministic first (zero LLM cost); LLM can refine later.
 */
import { z } from 'zod'

export const growthPlanSchema = z.object({
  objective: z.string(),
  targetDemos: z.number().int().positive().nullable(),
  windowDays: z.number().int().positive(),
  estimatedBudget: z.number().nonnegative().nullable(),
  currency: z.string().default('ILS'),
  channels: z.array(
    z.object({
      channel: z.enum(['outbound', 'meta_ads', 'retargeting', 'whatsapp_followup']),
      allocationPct: z.number().min(0).max(100),
      descriptionHe: z.string(),
    })
  ),
  experiments: z.array(
    z.object({
      name: z.string(),
      hypothesis: z.string(),
      primaryMetric: z.string(),
    })
  ),
  icpVariants: z.array(z.string()),
  messagingAngles: z.array(z.string()),
  risks: z.array(z.string()),
  requiresApproval: z.literal(true),
})

export type GrowthPlan = z.infer<typeof growthPlanSchema>

export function buildDeterministicGrowthPlan(input: {
  title: string
  targetDemos?: number | null
  windowDays: number
  maxBudget?: number | null
}): GrowthPlan {
  const demos = input.targetDemos ?? 10
  return growthPlanSchema.parse({
    objective: input.title,
    targetDemos: demos,
    windowDays: input.windowDays,
    estimatedBudget: input.maxBudget ?? null,
    currency: 'ILS',
    channels: [
      {
        channel: 'outbound',
        allocationPct: 40,
        descriptionHe: `איתור ופנייה מותאמת ל־${Math.max(demos * 15, 50)} חברות ניהול (לא ספאם)`,
      },
      {
        channel: 'meta_ads',
        allocationPct: 45,
        descriptionHe: 'קמפיין לידים Meta לבדיקת זוויות — דורש אישור השקה נפרד',
      },
      {
        channel: 'retargeting',
        allocationPct: 10,
        descriptionHe: 'רימרקטינג למבקרים בדף נחיתה (אחרי שיש תנועה)',
      },
      {
        channel: 'whatsapp_followup',
        allocationPct: 5,
        descriptionHe: 'פולו־אפ בהסכמה ללידים חמים בלבד',
      },
    ],
    experiments: [
      {
        name: 'Chaos vs Control messaging',
        hypothesis: 'מסר על כאוס וואטסאפ ימיר טוב יותר ממסר על חיסכון בעלויות (לא מוכח)',
        primaryMetric: 'qualified_demo_rate',
      },
      {
        name: 'Outbound vs Meta mix',
        hypothesis: 'שילוב outbound ל-HOT + Meta לכיסוי ארצי יביא יותר דמואים מכל ערוץ לבד',
        primaryMetric: 'qualified_demos',
      },
    ],
    icpVariants: [
      'בעלים/מנכ״ל חברת ניהול קטנה-בינונית',
      'מנהל תפעול / אחזקה בחברת ניהול',
      'חברת ניהול עם 10–30 בניינים (השערה)',
    ],
    messagingAngles: [
      'וואטסאפ הוא לא מערכת אחזקה',
      'ראות מלאה לתקלות פתוחות ו-SLA',
      'מקום אחד לדיירים, עובדים ומנהלים',
    ],
    risks: [
      'לידים זולים שאינם מותאמים',
      'פניות בלי הקשר מחקרי = המרות נמוכות',
      'חריגת תקציב בלי אישור — חסומה ע״י guardrails',
    ],
    requiresApproval: true,
  })
}
