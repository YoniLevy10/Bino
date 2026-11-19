/**
 * Copy-paste specs for creating WhatsApp templates in Meta Business Manager.
 * Shown in Settings → WhatsApp for the platform owner (not building managers).
 */

export type MetaTemplateButton =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }

export type MetaTemplateSpec = {
  id: string
  metaName: string
  status: 'submitted' | 'todo' | 'approved'
  category: 'Utility' | 'Marketing'
  language: string
  languageLabel: string
  purpose: string
  body: string
  variables: { index: number; label: string; sample: string }[]
  header: string | null
  footer: string | null
  /** Structured buttons for Composio / Meta create API (preferred). */
  buttonComponents: MetaTemplateButton[] | null
  /** Legacy one-line summary for UI copy-paste (kept for older panels). */
  buttons: string | null
  notes: string[]
}

export const META_WHATSAPP_TEMPLATE_SPECS: MetaTemplateSpec[] = [
  {
    id: 'ticket_closed',
    metaName: 'ticket_closed',
    status: 'submitted',
    category: 'Utility',
    language: 'he',
    languageLabel: 'עברית',
    purpose: 'עדכון לדייר שהתקלה נסגרה (אוטומטי + תיבת WhatsApp + קמפיין)',
    body:
      'שלום, התקלה שדיווחתם בבניין {{1}} טופלה ונסגרה.\n\n' +
      'אם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.',
    variables: [{ index: 1, label: 'שם בניין / פרויקט', sample: 'מקור חיים 40ב' }],
    header: null,
    footer: null,
    buttonComponents: null,
    buttons: null,
    notes: [
      'ללא אימוג\'ים — Meta דוחה לפעמים.',
      'קטגוריה Utility בלבד — לא Marketing.',
      'שם התבנית ב-Meta חייב להיות בדיוק: ticket_closed',
    ],
  },
  {
    id: 'sla_escalation',
    metaName: 'sla_escalation_resident',
    status: 'todo',
    category: 'Utility',
    language: 'he',
    languageLabel: 'עברית',
    purpose: 'עדכון לדייר שתקלה פתוחה עדיין בטיפול (cron SLA + תיבת WhatsApp)',
    body:
      'שלום, הפנייה שלך #{{1}} בנושא "{{2}}" עדיין בטיפול.\n\n' +
      'אנחנו מטפלים בה. תודה על הסבלנות.',
    variables: [
      { index: 1, label: 'מספר פנייה', sample: '123' },
      { index: 2, label: 'תיאור קצר', sample: 'תקלה במעלית' },
    ],
    header: null,
    footer: null,
    buttonComponents: null,
    buttons: null,
    notes: [
      'שם התבנית ב-Meta: sla_escalation_resident',
      'קטגוריה Utility.',
    ],
  },
  {
    id: 'manager_reply',
    metaName: 'manager_reply',
    status: 'submitted',
    category: 'Utility',
    language: 'he',
    languageLabel: 'עברית',
    purpose:
      'פתיחת שיחה / הודעה יזומה מתיבת WhatsApp לדייר או לגורם חיצוני — {{2}} = הטקסט שהמנהל כתב בקומפוז, גם מחוץ ל-24 שעות',
    body:
      'שלום {{1}},\n\n' +
      '{{2}}\n\n' +
      'לאישור קריאה לחצו «קיבלתי», או השיבו בהודעה.',
    variables: [
      { index: 1, label: 'שם נמען/ת', sample: 'יוני' },
      {
        index: 2,
        label: 'תוכן ההודעה (מהמנהל)',
        sample: 'נשמח לתאם הגעה מחר בין 9:00 ל-11:00. אפשר להשיב כאן.',
      },
    ],
    header: null,
    footer: 'צוות הניהול',
    buttonComponents: [{ type: 'QUICK_REPLY', text: 'קיבלתי' }],
    buttons: 'QUICK_REPLY · קיבלתי',
    notes: [
      'שם ברירת מחדל ב-Meta: manager_reply (או WHATSAPP_META_TEMPLATE_MANAGER_REPLY).',
      'קטגוריה Utility — לא Marketing. ללא אימוג\'ים.',
      '{{1}} = שם נמען, {{2}} = הטקסט שהמנהל כתב בתיבה — בלי הקלדה כפולה.',
      'כפתור QUICK_REPLY «קיבלתי» פותח חלון 24 שעות לשיחה חופשית (גם בלי כפתור — כל תשובה פותחת).',
      'אם כבר אושרה גרסה ישנה בלי כפתור: צרו manager_outreach (או name_suffix) ואז הגדירו WHATSAPP_META_TEMPLATE_MANAGER_REPLY לשם החדש. השליחה תמשיך לעבוד גם עם הגרסה הישנה.',
    ],
  },
  {
    id: 'worker_assignment',
    metaName: 'worker_assignment_notice',
    status: 'approved',
    category: 'Utility',
    language: 'he',
    languageLabel: 'עברית',
    purpose: 'הודעה לעובד ששויכה אליו תקלה (SMS + WhatsApp)',
    body:
      'תקלה חדשה ב{{1}}\n' +
      'מספר: #{{2}}\n' +
      '{{3}}',
    variables: [
      { index: 1, label: 'שם בניין', sample: 'מקור חיים 40ב' },
      { index: 2, label: 'מספר תקלה', sample: '456' },
      { index: 3, label: 'תיאור', sample: 'דליפה במקלחת' },
    ],
    header: null,
    footer: null,
    buttonComponents: null,
    buttons: null,
    notes: ['כבר מאושר — לעיון בלבד.'],
  },
  {
    id: 'worker_completion_photo',
    metaName: 'worker_completion_photo',
    status: 'todo',
    category: 'Utility',
    language: 'he',
    languageLabel: 'עברית',
    purpose: 'תמונת סיום תיקון מעובד לדייר — גם מחוץ לחלון 24 שעות',
    body:
      'שלום, התיקון בבניין {{1}} בוצע.\n\n' +
      'תודה על הדיווח.',
    variables: [{ index: 1, label: 'שם בניין / פרויקט', sample: 'מקור חיים 40ב' }],
    header: 'תמונה (Image) — URL דינמי בזמן שליחה',
    footer: null,
    buttonComponents: null,
    buttons: null,
    notes: [
      'שם התבנית ב-Meta חייב להיות בדיוק: worker_completion_photo',
      'קטגוריה Utility — לא Marketing.',
      'Header מסוג Image (לא טקסט).',
      'ללא אימוג\'ים.',
      'נדרש לאישור Meta לפני שליחה מחוץ ל-24 שעות.',
    ],
  },
]

export function getMetaTemplateSpecById(id: string): MetaTemplateSpec | undefined {
  return META_WHATSAPP_TEMPLATE_SPECS.find((s) => s.id === id)
}

/** Specs that can be submitted via Composio (text body; no image-header media example). */
export function isMetaTemplateSpecComposable(spec: MetaTemplateSpec): boolean {
  if (spec.category !== 'Utility') return false
  if (spec.header?.toLowerCase().includes('image')) return false
  return true
}

/** Sanitize client/label into Meta template name suffix (a-z0-9_). */
export function sanitizeMetaTemplateNameSuffix(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

export type MetaTemplateCreateComponent =
  | {
      type: 'BODY'
      text: string
      example?: { body_text: string[][] }
    }
  | {
      type: 'HEADER'
      format?: 'IMAGE' | 'TEXT'
      text?: string
    }
  | {
      type: 'FOOTER'
      text: string
    }
  | {
      type: 'BUTTONS'
      buttons: Array<
        | { type: 'QUICK_REPLY'; text: string }
        | { type: 'URL'; text: string; url: string }
        | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
      >
    }

/**
 * Build Meta Cloud API create payload (UTILITY only).
 * Optional nameSuffix → client-adapted unique name (e.g. ticket_closed_bamakor).
 * Optional bodyOverride → customer-adapted copy; must keep {{n}} placeholders.
 */
export function buildMetaTemplateCreatePayload(
  spec: MetaTemplateSpec,
  options?: {
    nameSuffix?: string | null
    bodyOverride?: string | null
    language?: string | null
  }
): {
  name: string
  category: 'UTILITY'
  language: string
  allow_category_change: boolean
  components: MetaTemplateCreateComponent[]
} {
  if (spec.category !== 'Utility') {
    throw new Error('Only Utility (service) templates may be created via this flow')
  }

  const suffix = options?.nameSuffix ? sanitizeMetaTemplateNameSuffix(options.nameSuffix) : ''
  const name = suffix ? `${spec.metaName}_${suffix}`.slice(0, 512) : spec.metaName
  const body = (options?.bodyOverride?.trim() || spec.body).trim()
  const language = (options?.language?.trim() || spec.language || 'he').trim()

  const exampleRow = spec.variables.map((v) => v.sample)
  const components: MetaTemplateCreateComponent[] = [
    {
      type: 'BODY',
      text: body,
      ...(exampleRow.length
        ? { example: { body_text: [exampleRow] } }
        : {}),
    },
  ]

  const footer = spec.footer?.trim()
  if (footer) {
    components.push({ type: 'FOOTER', text: footer.slice(0, 60) })
  }

  const buttons = spec.buttonComponents
  if (buttons && buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) => {
        if (b.type === 'QUICK_REPLY') {
          return { type: 'QUICK_REPLY' as const, text: b.text.trim().slice(0, 25) }
        }
        if (b.type === 'URL') {
          return { type: 'URL' as const, text: b.text.trim().slice(0, 25), url: b.url }
        }
        return {
          type: 'PHONE_NUMBER' as const,
          text: b.text.trim().slice(0, 25),
          phone_number: b.phone_number,
        }
      }),
    })
  }

  return {
    name,
    category: 'UTILITY',
    language,
    allow_category_change: true,
    components,
  }
}

/** Plain-text block for copy-paste into Meta form */
export function formatMetaTemplateSpecForCopy(spec: MetaTemplateSpec): string {
  const lines = [
    `שם תבנית: ${spec.metaName}`,
    `קטגוריה: ${spec.category}`,
    `שפה: ${spec.languageLabel} (${spec.language})`,
    '',
    '— גוף ההודעה (Body) —',
    spec.body,
    '',
    '— דוגמאות לשדות —',
    ...spec.variables.map((v) => `{{${v.index}}} ${v.label} → דוגמה: ${v.sample}`),
  ]
  if (spec.header) lines.push('', `Header: ${spec.header}`)
  if (spec.footer) lines.push('', `Footer: ${spec.footer}`)
  if (spec.buttonComponents?.length) {
    lines.push('', '— כפתורים —')
    for (const b of spec.buttonComponents) {
      if (b.type === 'QUICK_REPLY') lines.push(`• QUICK_REPLY: ${b.text}`)
      else if (b.type === 'URL') lines.push(`• URL: ${b.text} → ${b.url}`)
      else lines.push(`• PHONE: ${b.text} → ${b.phone_number}`)
    }
  } else if (spec.buttons) {
    lines.push('', `Buttons: ${spec.buttons}`)
  }
  if (spec.notes.length) {
    lines.push('', '— הערות —', ...spec.notes.map((n) => `• ${n}`))
  }
  return lines.join('\n')
}
