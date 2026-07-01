import {
  metaTemplateNameManagerReply,
  metaTemplateNameSlaEscalation,
  metaTemplateNameTicketClosed,
} from '@/lib/meta-whatsapp-pending-actions'

export type InboxMetaTemplateParam = {
  key: string
  label: string
  placeholder: string
  maxLength: number
}

export type InboxMetaTemplate = {
  id: string
  label: string
  description: string
  language: string
  params: InboxMetaTemplateParam[]
  resolveMetaName: () => string
  /** Preview for inbox UI */
  preview: string
}

/** Meta Utility templates managers can send from inbox when the 24h session expired. */
export const WHATSAPP_INBOX_META_TEMPLATES: InboxMetaTemplate[] = [
  {
    id: 'manager_reply',
    label: 'הודעה מהמשרד',
    description: 'תשובה לדייר דרך תבנית Meta — תוכן ההודעה ב-{{2}}, עובד גם מחוץ ל-24 שעות.',
    language: 'he',
    resolveMetaName: metaTemplateNameManagerReply,
    preview: 'שלום {{שם}},\n\n{{הודעה}}',
    params: [
      {
        key: 'resident_name',
        label: 'שם דייר/ה',
        placeholder: 'למשל: יוני',
        maxLength: 40,
      },
      {
        key: 'message',
        label: 'תוכן ההודעה',
        placeholder: 'כתבו כאן את ההודעה לדייר/ה…',
        maxLength: 500,
      },
    ],
  },
  {
    id: 'ticket_closed',
    label: 'סגירת תקלה',
    description: 'עדכון לדייר שהתקלה טופלה ונסגרה (מחוץ ל-24 שעות).',
    language: 'he',
    resolveMetaName: metaTemplateNameTicketClosed,
    preview:
      'שלום, התקלה בדירתכם בבניין {{בניין}} טופלה ונסגרה. אם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.',
    params: [
      {
        key: 'building',
        label: 'שם בניין / פרויקט',
        placeholder: 'למשל: מקור חיים 40ב',
        maxLength: 60,
      },
    ],
  },
  {
    id: 'sla_escalation',
    label: 'תקלה עדיין בטיפול (SLA)',
    description: 'עדכון שהפנייה עדיין בטיפול — לתקלה פתוחה זמן רב.',
    language: 'he',
    resolveMetaName: metaTemplateNameSlaEscalation,
    preview:
      'שלום, הפנייה שלך #{{מספר}} בנושא "{{תיאור}}" עדיין בטיפול. אנחנו מטפלים בה.',
    params: [
      {
        key: 'ticket_number',
        label: 'מספר פנייה',
        placeholder: '123',
        maxLength: 20,
      },
      {
        key: 'description',
        label: 'תיאור קצר',
        placeholder: 'למשל: תקלה במעלית',
        maxLength: 120,
      },
    ],
  },
]

export function getInboxMetaTemplateById(id: string): InboxMetaTemplate | undefined {
  return WHATSAPP_INBOX_META_TEMPLATES.find((t) => t.id === id)
}

export function buildInboxTemplatePreview(template: InboxMetaTemplate, paramValues: string[]): string {
  if (template.id === 'manager_reply') {
    const name = paramValues[0]?.trim() || 'דייר/ה'
    const body = paramValues[1]?.trim() || '[הודעה]'
    return `שלום ${name},\n\n${body}`
  }
  if (template.id === 'ticket_closed') {
    const building = paramValues[0]?.trim() || '[שם בניין]'
    return `שלום, התקלה בדירתכם בבניין ${building} טופלה ונסגרה.\n\nאם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.`
  }
  if (template.id === 'sla_escalation') {
    const num = paramValues[0]?.trim() || '[מספר]'
    const desc = paramValues[1]?.trim() || '[תיאור]'
    return `שלום, הפנייה שלך #${num} בנושא "${desc}" עדיין בטיפול.\n\nאנחנו מטפלים בה. תודה על הסבלנות.`
  }
  return template.preview
}
