/** Actions that require Meta Business Manager / Developer Console — not automatable in code. */

export type MetaPendingAction = {
  id: string
  title: string
  description: string
  /** submitted = waiting Meta review; todo = not started */
  status: 'submitted' | 'todo' | 'optional'
  href?: string
}

export const META_WHATSAPP_PENDING_ACTIONS: MetaPendingAction[] = [
  {
    id: 'ticket_closed',
    title: 'אישור תבנית ticket_closed',
    description:
      'Utility · עברית · משתנה {{1}} = שם בניין. בלי אישור — דייר לא מקבל הודעה על סגירה מחוץ ל-24 שעות.',
    status: 'submitted',
    href: 'https://business.facebook.com/wa/manage/message-templates/',
  },
  {
    id: 'sla_escalation',
    title: 'יצירת תבנית sla_escalation_resident',
    description:
      'Utility · עברית · {{1}}=מספר פנייה, {{2}}=תיאור קצר. דוגמה: "שלום, הפנייה #{{1}} בנושא {{2}} עדיין בטיפול."',
    status: 'todo',
    href: 'https://business.facebook.com/wa/manage/message-templates/',
  },
  {
    id: 'waba_cleanup',
    title: 'מחיקת 2 חשבונות WABA כפולים',
    description:
      'השאירו רק 1310695487595011 (055-974-0732). מחקו את 1320727389950379 ו-1893485084635441.',
    status: 'optional',
    href: 'https://business.facebook.com/settings/whatsapp-business-accounts',
  },
  {
    id: 'display_name',
    title: 'שינוי שם תצוגה "אייפון" → Bamakor',
    description: 'Phone Numbers → Edit display name — מה שהדייר רואה בראש הצ\'אט.',
    status: 'optional',
    href: 'https://business.facebook.com/wa/manage/phone-numbers/',
  },
  {
    id: 'app_secret',
    title: 'WHATSAPP_APP_SECRET ב-Vercel',
    description: 'Meta Developer → App → Settings → Basic → App Secret. מאבטח את ה-webhook.',
    status: 'todo',
    href: 'https://developers.facebook.com/apps/',
  },
  {
    id: 'message_status_webhook',
    title: 'Webhook: message_status (delivered/read)',
    description: 'Meta Developer → Webhooks → Subscribe to message_status. אחרי זה נחבר בקוד.',
    status: 'optional',
    href: 'https://developers.facebook.com/apps/',
  },
]

/** Live WABA + phone — for reference in settings panel. */
export const META_LIVE_WABA_ID = '1310695487595011'
export const META_LIVE_PHONE_NUMBER_ID = '1114529741736592'
export const META_LIVE_DISPLAY_PHONE = '055-974-0732'

export function metaTemplateNameTicketClosed(): string {
  return process.env.WHATSAPP_META_TEMPLATE_TICKET_CLOSED?.trim() || 'ticket_closed'
}

export function metaTemplateNameSlaEscalation(): string {
  return process.env.WHATSAPP_META_TEMPLATE_SLA_ESCALATION?.trim() || 'sla_escalation_resident'
}

export function metaTemplateNameWorkerAssignment(): string {
  return process.env.WHATSAPP_META_TEMPLATE_WORKER_ASSIGNMENT?.trim() || 'worker_assignment_notice'
}
