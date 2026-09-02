/**
 * Copywriter — hypothesis-linked ad copy. Deterministic templates first (zero cost).
 */
import { z } from 'zod'

export const adCopyVariationSchema = z.object({
  hypothesisId: z.string().uuid().optional(),
  angle: z.string(),
  hook: z.string(),
  primaryText: z.string(),
  headline: z.string(),
  description: z.string(),
  cta: z.string(),
  offer: z.string(),
  targetPain: z.string(),
  targetPersona: z.string(),
})

export type AdCopyVariation = z.infer<typeof adCopyVariationSchema>

export function generateCopyForHypothesis(input: {
  brandName: string
  hypothesis: {
    id: string
    creative_angle: string
    statement: string
    target_pain: string | null
    target_persona: string | null
  }
  offer?: string
  persona?: string
}): AdCopyVariation[] {
  const pain = input.hypothesis.target_pain ?? 'ניהול אחזקה מפוזר'
  const persona = input.hypothesis.target_persona ?? input.persona ?? 'מנהל בחברת ניהול נכסים'
  const offer = input.offer ?? 'תיאום הדגמה קצרה'
  const angle = input.hypothesis.creative_angle

  const hooks = [
    angle,
    input.hypothesis.statement.length > 20
      ? input.hypothesis.statement.slice(0, 120)
      : `${pain} לא חייב להיות סטנדרט.`,
    brandHook(input.brandName, angle),
  ]

  return hooks.map((hook, idx) =>
    adCopyVariationSchema.parse({
      hypothesisId: input.hypothesis.id,
      angle,
      hook,
      primaryText: buildPrimary(hook, pain, input.brandName, offer, idx),
      headline: buildHeadline(angle, idx),
      description: `${input.brandName} — שליטה תפעולית במקום כאוס הודעות.`,
      cta: 'LEARN_MORE',
      offer,
      targetPain: pain,
      targetPersona: persona,
    })
  )
}

function brandHook(brand: string, angle: string): string {
  return `${brand}: ${angle}`
}

function buildPrimary(hook: string, pain: string, brand: string, offer: string, idx: number): string {
  if (idx === 0) {
    return `${hook}\n\nחברות ניהול נכסים עדיין מנהלות תקלות דרך וואטסאפ, שיחות וגיליונות — בלי היסטוריה ברורה ובלי SLA.\n\n${brand} מרכזת דיווחים, כרטיסי תקלה ועובדים במקום אחד.\n\n${offer}.`
  }
  if (idx === 1) {
    return `הכאב: ${pain}.\n\n${hook}\n\nעם ${brand} רואים מה פתוח, מי מטפל וכמה זמן זה מחכה — במקום לחפש בתכתובות.\n\n${offer}.`
  }
  return `${hook}\n\nלא עוד ניהול אחזקה מתוך צ'אטים מפוזרים.\nמערכת אחת לדיירים, עובדים ומנהלים.\n\n${offer}.`
}

function buildHeadline(angle: string, idx: number): string {
  if (idx === 0) return angle.length > 40 ? angle.slice(0, 40) : angle
  if (idx === 1) return 'אחזקה בלי כאוס וואטסאפ'
  return 'שליטה תפעולית לחברות ניהול'
}
