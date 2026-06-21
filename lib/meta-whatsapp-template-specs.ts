/**
 * Copy-paste specs for creating WhatsApp templates in Meta Business Manager.
 * Shown in Settings → WhatsApp for the platform owner (not building managers).
 */

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
    buttons: null,
    notes: [
      'שם התבנית ב-Meta: sla_escalation_resident',
      'קטגוריה Utility.',
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
    buttons: null,
    notes: ['כבר מאושר — לעיון בלבד.'],
  },
]

export function getMetaTemplateSpecById(id: string): MetaTemplateSpec | undefined {
  return META_WHATSAPP_TEMPLATE_SPECS.find((s) => s.id === id)
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
  if (spec.notes.length) {
    lines.push('', '— הערות —', ...spec.notes.map((n) => `• ${n}`))
  }
  return lines.join('\n')
}
