/**
 * Hook-first creative methodology (concepts from creative-ad-agent, MIT — ported to TS).
 * Every batch intentionally varies hook / pain / visual / CTA / format / tone.
 */
import { z } from 'zod'

export const creativeConceptSchema = z.object({
  id: z.string(),
  hook: z.string(),
  pain: z.string(),
  headline: z.string(),
  primaryText: z.string(),
  description: z.string(),
  cta: z.string(),
  visualBrief: z.string(),
  format: z.enum(['single_image', 'carousel', 'video_script', 'story']),
  tone: z.enum(['direct', 'empathetic', 'urgent', 'aspirational', 'practical']),
  angle: z.string(),
})

export type CreativeConcept = z.infer<typeof creativeConceptSchema>

export type DiversityAxes = {
  hooks: Set<string>
  pains: Set<string>
  visuals: Set<string>
  ctas: Set<string>
  formats: Set<string>
  tones: Set<string>
}

export function measureDiversity(concepts: CreativeConcept[]): DiversityAxes & { score: number } {
  const axes: DiversityAxes = {
    hooks: new Set(concepts.map((c) => c.hook)),
    pains: new Set(concepts.map((c) => c.pain)),
    visuals: new Set(concepts.map((c) => c.visualBrief)),
    ctas: new Set(concepts.map((c) => c.cta)),
    formats: new Set(concepts.map((c) => c.format)),
    tones: new Set(concepts.map((c) => c.tone)),
  }
  const n = Math.max(concepts.length, 1)
  const score =
    (axes.hooks.size +
      axes.pains.size +
      axes.visuals.size +
      axes.ctas.size +
      axes.formats.size +
      axes.tones.size) /
    (6 * n)
  return { ...axes, score }
}

/** Deterministic Bamakor concept batch — factual product grounding, no fabricated claims. */
export function generateBamakorCreativeBatch(): CreativeConcept[] {
  const concepts: CreativeConcept[] = [
    {
      id: 'concept_a_whatsapp',
      hook: 'עדיין מנהלים תקלות בבניין דרך WhatsApp?',
      pain: 'תקשורת דיירים מפוזרת בהודעות',
      headline: 'וואטסאפ זה לא מערכת אחזקה',
      primaryText:
        'חברות ניהול מקבלות עשרות הודעות ביום מדיירים. במקור מרכזת דיווחים, סטטוסים וספקים במקום אחד — כדי שהתפעול לא יחיה בצ׳אטים.',
      description: 'מערכת תפעול לחברות ניהול בניינים',
      cta: 'קבעו דמו',
      visualBrief: 'מסך טלפון עמוס הודעות וואטסאפ מול דשבורד מסודר של תקלות (בלי לוגואים מזויפים)',
      format: 'single_image',
      tone: 'direct',
      angle: 'whatsapp_chaos',
    },
    {
      id: 'concept_b_calls',
      hook: 'כמה זמן העובדים שלכם מבזבזים על טלפונים מדיירים?',
      pain: 'שיחות חוזרות וסטטוס ידני',
      headline: 'פחות שיחות. יותר סגירות תקלות.',
      primaryText:
        'כשדייר יכול לדווח ולעקוב דיגיטלית, העומס על המוקד והמנהלים יורד. במקור בנויה לזה — לא כ״טרנספורמציה דיגיטלית״ ריקה, אלא כסדר תפעולי.',
      description: 'הפחיתו רעש תפעולי',
      cta: 'לתיאום הדגמה',
      visualBrief: 'עובד תחזוקה עם טלפון עמוס מול רשימת משימות ברורה באפליקציה',
      format: 'single_image',
      tone: 'practical',
      angle: 'resident_calls',
    },
    {
      id: 'concept_c_one_screen',
      hook: 'כל הבניינים. כל התקלות. מסך אחד.',
      pain: 'חוסר ראות בין מתחמים',
      headline: 'ראות מלאה לכל המתחמים שלכם',
      primaryText:
        'מנהלי תפעול צריכים לדעת מה פתוח, מה באיחור, ומי אחראי — בכל הבניינים. במקור נותנת תמונה אחת במקום גיליונות וצ׳אטים.',
      description: 'דשבורד תפעולי לחברות ניהול',
      cta: 'ראו איך זה עובד',
      visualBrief: 'דשבורד RTL עם כרטיסי בניינים ותקלות פתוחות (מוצר אמיתי / מוקאפ נאמן)',
      format: 'carousel',
      tone: 'aspirational',
      angle: 'single_pane',
    },
    {
      id: 'concept_d_smart_pmc',
      hook: 'מחברת ניהול לחברת ניהול חכמה',
      pain: 'תהליכים ידניים שחוזרים על עצמם',
      headline: 'אוטומציה לתהליכים שחוזרים על עצמם',
      primaryText:
        'דיווח דייר → הקצאה → מעקב → סגירה. במקור מחברת את השלבים כדי שהצוות יתמקד בטיפול, לא בתיאום.',
      description: 'תהליך מובנה לתקלות',
      cta: 'התחילו בדמו',
      visualBrief: 'זרימת תהליך פשוטה (4 שלבים) בעברית',
      format: 'single_image',
      tone: 'aspirational',
      angle: 'smart_ops',
    },
    {
      id: 'concept_e_sla',
      hook: 'אתם יודעים מה ה־SLA האמיתי של התקלות שלכם?',
      pain: 'אין מדידה של זמני טיפול',
      headline: 'סטטוס ו־SLA בלי לרדוף אחרי הודעות',
      primaryText:
        'במקום לשאול ״מה עם התקלה?״ — רואים סטטוס. מתאים לחברות שרוצות שליטה תפעולית, לא עוד אפליקציה יפה.',
      description: 'מעקב SLA לתקלות בניין',
      cta: 'דברו איתנו',
      visualBrief: 'כרטיס תקלה עם סטטוס וזמן פתיחה',
      format: 'story',
      tone: 'urgent',
      angle: 'sla_visibility',
    },
    {
      id: 'concept_f_empathy',
      hook: 'הדיירים שלכם לא צריכים לחכות לתשובה בוואטסאפ',
      pain: 'חוויית דייר שבורה',
      headline: 'דיווח דייר מסודר — גם בסופ״ש',
      primaryText:
        'דייר מדווח, מקבל אישור, והצוות מטפל לפי תור עדיפויות. במקור מחברת בין דיירים למנהלים בלי לאבד פניות.',
      description: 'חוויית דייר + שליטת מנהל',
      cta: 'לתיאום פגישה',
      visualBrief: 'דייר שולח דיווח מהנייד; מנהל רואה בדשבורד',
      format: 'video_script',
      tone: 'empathetic',
      angle: 'resident_experience',
    },
  ]
  return concepts.map((c) => creativeConceptSchema.parse(c))
}

export const BAMAKOR_HOOKS = [
  'עדיין מנהלים תקלות בבניין דרך WhatsApp?',
  'כמה זמן העובדים שלכם מבזבזים על טלפונים מדיירים?',
  'כל הבניינים. כל התקלות. מסך אחד.',
  'מחברת ניהול לחברת ניהול חכמה.',
  'אתם יודעים מה ה־SLA האמיתי של התקלות שלכם?',
  'הדיירים שלכם לא צריכים לחכות לתשובה בוואטסאפ',
  'גיליון Excel הוא לא מערכת אחזקה',
  'כשהמנהל בחופשה — מי רואה את התקלות הפתוחות?',
  'ספקים, עובדים, דיירים — שלושה צ׳אטים או מערכת אחת?',
  'ניהול בניינים בלי רעש תפעולי מיותר',
] as const
