/**
 * Outbound sequence templates for Israeli property-management ICP.
 * Personalized placeholders only — never fabricate missing facts.
 */
export type SequenceStepTemplate = {
  stepOrder: number
  delayDays: number
  subjectTemplate: string
  bodyTemplate: string
  angle: string
}

export type SequenceTemplate = {
  key: string
  name: string
  channel: 'email' | 'whatsapp' | 'linkedin_manual' | 'phone_task'
  description: string
  steps: SequenceStepTemplate[]
}

export const BAMAKOR_OUTBOUND_SEQUENCES: SequenceTemplate[] = [
  {
    key: 'ops_chaos_whatsapp',
    name: 'כאוס וואטסאפ → סדר תפעולי',
    channel: 'email',
    description: 'זווית: דיווחי דיירים בוואטסאפ במקום מערכת',
    steps: [
      {
        stepOrder: 0,
        delayDays: 0,
        subjectTemplate: '{{companyName}} — ניהול תקלות בלי כאוס וואטסאפ',
        bodyTemplate:
          'שלום{{contactGreeting}},\n\nראיתי ש{{companyName}}{{cityClause}} עוסקת בניהול/אחזקת מבנים.\nבמקור נבנתה כדי לרכז דיווחי דיירים, תקלות וספקים במקום אחד — במקום שכל התפעול יתנהל בשיחות ווואטסאפ.\n\nאשמח ל־15 דקות להראות איך זה נראה אצל חברות ניהול דומות.\n\nבברכה,\nצוות במקור\nלהסרה: השב STOP',
        angle: 'whatsapp_chaos',
      },
      {
        stepOrder: 1,
        delayDays: 3,
        subjectTemplate: 'המשך: ראות לתקלות פתוחות ב־{{companyName}}',
        bodyTemplate:
          'שלום שוב{{contactGreeting}},\n\nרק מוסיף: המנהלים אצלנו רואים בכל רגע אילו תקלות פתוחות, מי מטפל, ומה ה־SLA — בלי לרדוף אחרי הודעות.\nאם רלוונטי — אפשר דמו קצר השבוע.\n\nבמקור · להסרה: STOP',
        angle: 'visibility_sla',
      },
      {
        stepOrder: 2,
        delayDays: 7,
        subjectTemplate: 'זווית אחרת ל־{{companyName}}: פחות שיחות חוזרות מדיירים',
        bodyTemplate:
          'שלום{{contactGreeting}},\n\nזווית אחרת: הרבה חברות ניהול מדווחות על עומס טלפונים חוזרים מדיירים ששואלים "מה עם התקלה?".\nבמקור נותנת לדייר סטטוס דיגיטלי ומפחיתה את הרעש התפעולי.\n\nרוצה לראות דמו?\nלהסרה: STOP',
        angle: 'resident_calls',
      },
      {
        stepOrder: 3,
        delayDays: 14,
        subjectTemplate: 'סגירה קצרה — {{companyName}}',
        bodyTemplate:
          'שלום{{contactGreeting}},\n\nזו ההודעה האחרונה ממני בנושא.\nאם ניהול תקלות/דיירים רלוונטי ל־{{companyName}} — אשמח לתאם דמו.\nאם לא — אין בעיה, לא אמשיך לפנות.\n\nבמקור · STOP להסרה',
        angle: 'final',
      },
    ],
  },
  {
    key: 'ops_manager_focus',
    name: 'מנהל תפעול / אחזקה',
    channel: 'email',
    description: 'פנייה למנהל תפעול — עובדים, ספקים, סטטוסים',
    steps: [
      {
        stepOrder: 0,
        delayDays: 0,
        subjectTemplate: 'למנהל התפעול ב־{{companyName}}',
        bodyTemplate:
          'שלום{{contactGreeting}},\n\nאם אתם מנהלים כמה בניינים, היום־יום נראה כך: דיירים כותבים, עובדים בטלפון, ספקים בוואטסאפ, ומנהל שמנסה לסגור את התמונה.\nבמקור מרכזת את זה למסך אחד עם אחריות וסטטוס.\n\nדמו קצר?\nלהסרה: STOP',
        angle: 'ops_manager',
      },
      {
        stepOrder: 1,
        delayDays: 4,
        subjectTemplate: 'מעקב: עובדים וספקים ב־{{companyName}}',
        bodyTemplate:
          'שלום{{contactGreeting}},\n\nאפשר גם לשייך תקלות לעובדים/ספקים ולעקוב אחרי סגירה — בלי לאבד הודעות.\nאשמח להראות.\nלהסרה: STOP',
        angle: 'vendors_workers',
      },
      {
        stepOrder: 2,
        delayDays: 10,
        subjectTemplate: 'סגירה — במקור ל־{{companyName}}',
        bodyTemplate:
          'שלום{{contactGreeting}},\n\nאם זה לא רלוונטי עכשיו — סמנו STOP ולא אמשיך.\nאם כן — קבעו דמו ונראה את המערכת על תרחיש שלכם.\n\nבמקור',
        angle: 'final',
      },
    ],
  },
  {
    key: 'linkedin_manual_tasks',
    name: 'משימות LinkedIn ידניות',
    channel: 'linkedin_manual',
    description: 'לא אוטומציה — משימות ידניות בלבד (תאימות לפלטפורמה)',
    steps: [
      {
        stepOrder: 0,
        delayDays: 0,
        subjectTemplate: 'חיבור LinkedIn',
        bodyTemplate:
          'משימה ידנית: חפש את {{contactName}} / {{companyName}} ב־LinkedIn. שלח Connection עם הערה קצרה על ניהול תקלות דיירים — בלי ספאם המוני.',
        angle: 'linkedin_connect',
      },
      {
        stepOrder: 1,
        delayDays: 5,
        subjectTemplate: 'הודעת ערך',
        bodyTemplate:
          'משימה ידנית: אם התקבלה החיבור — שלח הודעה אחת מותאמת (הזכר עיר/אתר אם ידועים). הצע דמו. עצור אם אין מענה אחרי הודעה אחת נוספת ביום 12.',
        angle: 'linkedin_value',
      },
      {
        stepOrder: 2,
        delayDays: 12,
        subjectTemplate: 'פולו־אפ אחרון',
        bodyTemplate: 'משימה ידנית אחרונה: פולו־אפ קצר או סגירה. סמן enrollment כ־completed.',
        angle: 'final',
      },
    ],
  },
]

export type PersonalizeContext = {
  companyName: string
  city?: string | null
  contactName?: string | null
  contactRole?: string | null
}

/** Fill templates; never invent city/contact — omit clauses when missing. */
export function personalizeTemplate(template: string, ctx: PersonalizeContext): string {
  const cityClause = ctx.city ? ` באזור ${ctx.city}` : ''
  const contactGreeting = ctx.contactName ? ` ${ctx.contactName}` : ''
  return template
    .replaceAll('{{companyName}}', ctx.companyName)
    .replaceAll('{{cityClause}}', cityClause)
    .replaceAll('{{contactGreeting}}', contactGreeting)
    .replaceAll('{{contactName}}', ctx.contactName || 'איש הקשר')
    .replaceAll('{{city}}', ctx.city || '')
}
