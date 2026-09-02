/**
 * First Bamakor growth campaign pack — DRAFT FOR APPROVAL ONLY.
 * Do not auto-launch Meta or send outreach without explicit approval.
 */
import { BAMAKOR_HOOKS, generateBamakorCreativeBatch } from '@/lib/growth/creative/hooks'
import { BAMAKOR_OUTBOUND_SEQUENCES } from '@/lib/growth/outreach/sequences'
import { z } from 'zod'

export const campaignPackSchema = z.object({
  status: z.literal('pending_approval'),
  autoLaunch: z.literal(false),
  objectiveHe: z.string(),
  icpVariants: z.array(z.string()).min(3),
  marketingAngles: z.array(z.string()).min(5),
  hooks: z.array(z.string()).min(10),
  metaAdConcepts: z.array(z.any()).min(6),
  outboundSequences: z.array(z.any()).min(3),
  offers: z.array(
    z.object({
      id: z.string(),
      titleHe: z.string(),
      descriptionHe: z.string(),
    })
  ),
  landingPageOutline: z.object({
    hero: z.string(),
    proof: z.string(),
    howItWorks: z.string(),
    cta: z.string(),
    formFields: z.array(z.string()),
  }),
  experimentMatrix: z.array(
    z.object({
      name: z.string(),
      hypothesis: z.string(),
      arms: z.array(z.string()),
      primaryMetric: z.string(),
      suggestedBudgetIls: z.number(),
    })
  ),
  recommendedTestBudgetIls: z.number(),
  trackingPlan: z.array(z.string()),
  successCriteria: z.array(z.string()),
  searchIntentsHe: z.array(z.string()),
})

export type FirstCampaignPack = z.infer<typeof campaignPackSchema>

export function buildFirstBamakorCampaignPack(): FirstCampaignPack {
  const concepts = generateBamakorCreativeBatch()
  return campaignPackSchema.parse({
    status: 'pending_approval',
    autoLaunch: false,
    objectiveHe: 'להפיק דמואים מותאמים מחברות ניהול נכסים / אחזקת מבנים בישראל',
    icpVariants: [
      'בעלים / מנכ״ל חברת ניהול קטנה–בינונית (השערה לבדיקה)',
      'מנהל תפעול / אחזקה בחברת ניהול עם מספר בניינים',
      'חברת ניהול עם ~10–30 בניינים מגורים (השערה — לא מוכחת)',
    ],
    marketingAngles: [
      'וואטסאפ אינו מערכת אחזקה',
      'הפחתת שיחות חוזרות מדיירים',
      'ראות לכל התקלות הפתוחות ו־SLA',
      'מקום אחד לדיירים, עובדים וספקים',
      'ממעקב ידני לתהליך מובנה',
    ],
    hooks: [...BAMAKOR_HOOKS],
    metaAdConcepts: concepts,
    outboundSequences: BAMAKOR_OUTBOUND_SEQUENCES,
    offers: [
      {
        id: 'offer_demo',
        titleHe: 'דמו תפעולי מותאם (15–20 דק׳)',
        descriptionHe: 'הדגמה על תרחיש תקלות/דיירים — בלי התחייבות. לבדיקה מול הצעת ״ביקורת תפעול״.',
      },
      {
        id: 'offer_ops_audit',
        titleHe: 'ביקורת תפעול קצרה (השערה)',
        descriptionHe:
          'שיחת אבחון: איך היום מנהלים דיווחים, סטטוסים וספקים. לבדוק אם ממירה טוב יותר מדמו גנרי.',
      },
    ],
    landingPageOutline: {
      hero: 'ניהול תקלות ודיירים במקום אחד — במקום וואטסאפ וטלפונים',
      proof: 'מיועד לחברות ניהול בניינים בישראל (RTL, וואטסאפ אופרטיבי במוצר)',
      howItWorks: 'דייר מדווח → מנהל מקצה → מעקב סטטוס → סגירה',
      cta: 'קבעו דמו',
      formFields: ['שם', 'שם חברה', 'טלפון', 'מספר בניינים משוער (אופציונלי)', 'תפקיד'],
    },
    experimentMatrix: [
      {
        name: 'Chaos vs Cost messaging',
        hypothesis: 'מסר כאוס־וואטסאפ ימיר לדמו טוב יותר ממסר חיסכון בעלויות',
        arms: ['whatsapp_chaos', 'cost_savings'],
        primaryMetric: 'qualified_demo_rate',
        suggestedBudgetIls: 1200,
      },
      {
        name: 'Owner vs Ops audience',
        hypothesis: 'מנהלי תפעול יגיבו טוב יותר ממנכ״לים להודעות SLA',
        arms: ['owner_ceo', 'ops_manager'],
        primaryMetric: 'qualified_leads',
        suggestedBudgetIls: 1000,
      },
      {
        name: 'Offer: demo vs ops audit',
        hypothesis: '״ביקורת תפעול״ תמיר טוב יותר מ״קבעו דמו״',
        arms: ['offer_demo', 'offer_ops_audit'],
        primaryMetric: 'demo_booked',
        suggestedBudgetIls: 800,
      },
    ],
    recommendedTestBudgetIls: 3000,
    trackingPlan: [
      'UTM על כל מודעה + רצף outbound',
      'growth_conversions: landing → lead → qualified → demo_booked',
      'הפרדה: CTR/CPC (שיווק) מול דמואים מותאמים / ₪ (עסק)',
      'מיפוי Meta lead → growth_leads כשאפשר',
      'opt-out → growth_suppressions מיידי',
    ],
    successCriteria: [
      'לפחות 10 לידים מותאמים (score≥60) בתקופת הבדיקה',
      'לפחות 3 דמואים שנקבעו',
      'CPL לליד מותאם ≤ ₪150 או הסבר למה לא',
      'qualified_demos / ₪ spent מתועד — גם אם נמוך',
      'לפחות למידה אחת מתועדת ב־growth_learnings',
    ],
    searchIntentsHe: [
      'חברת ניהול ואחזקה בניינים',
      'ניהול בתים משותפים',
      'חברת ניהול נכסים',
      'אחזקת מבנים',
      'חברת ניהול בניינים תל אביב',
      'ניהול בתים משותפים ירושלים',
    ],
  })
}
