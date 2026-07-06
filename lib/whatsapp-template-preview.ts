import type { WhatsAppTemplateKey } from '@/lib/whatsapp-template-keys'
import { WHATSAPP_TEMPLATE_VAR_NAMES } from '@/lib/whatsapp-template-keys'

export type WhatsAppTemplatePreviewVars = Record<(typeof WHATSAPP_TEMPLATE_VAR_NAMES)[number], string>

const BASE_PREVIEW: WhatsAppTemplatePreviewVars = {
  project_name: 'מגדלי הים התיכון',
  ticket_number: '128',
  description: 'נזילה מהצנרת בחדר האמבטיה',
  reporter_name: 'ישראל ישראלי',
  building_line: '\nבניין: ב׳',
  list: '1. מגדלי הים התיכון — רחוב הרצל 12\n2. בית הכרמל — דיזנגוף 50',
}

/** Preview vars that match what the webhook actually injects per template. */
const PREVIEW_OVERRIDES: Partial<Record<WhatsAppTemplateKey, Partial<WhatsAppTemplatePreviewVars>>> = {
  choose_language: {
    project_name: '',
    ticket_number: '',
    description: '',
    reporter_name: '',
    building_line: '',
    list: '',
  },
  ask_building: {
    project_name: '',
    ticket_number: '',
    description: '',
    reporter_name: '',
    building_line: '',
    list: '',
  },
  last_project_confirm: {
    ticket_number: '',
    description: '',
    reporter_name: '',
    building_line: '',
    list: '',
  },
  building_list_body: {
    project_name: '',
    ticket_number: '',
    description: '',
    reporter_name: '',
    building_line: '',
    list: '',
  },
  clarification_reply: {
    project_name: '',
    ticket_number: '',
    description: '',
    reporter_name: '',
    building_line: '',
    list: '',
  },
  welcome: { reporter_name: '', building_line: '' },
  resident_prompt: {
    reporter_name: '',
    description: '',
    ticket_number: '',
    project_name: '',
    building_line: '',
  },
  session_created: {
    project_name: 'מגדלי הים התיכון',
    building_line: ' (בניין א׳)',
    reporter_name: '',
    ticket_number: '',
    description: '',
  },
  ticket_opened: {
    reporter_name: '972501234567',
    building_line: '\nבניין: א׳',
  },
  ticket_status_list: {
    list: 'תקלה #128: בטיפול. עובד דוד מטפל.\nתקלה #127: חדשה.',
    description: '',
    ticket_number: '',
    reporter_name: '',
    project_name: '',
    building_line: '',
  },
  building_multiple_matches: {
    list: '1. מגדלי הים התיכון (רחוב הרצל 12)\n2. בית הכרמל (דיזנגוף 50)',
  },
  duplicate_ticket: { ticket_number: '128' },
  sla_escalation_resident: {
    ticket_number: '128',
    description: 'נזילה מהצנרת בחדר האמבטיה',
  },
  pending_approval_note: {
    project_name: '',
    ticket_number: '',
    description: '',
    reporter_name: '',
    building_line: '',
    list: '',
  },
}

export function whatsAppTemplatePreviewVars(key: WhatsAppTemplateKey): WhatsAppTemplatePreviewVars {
  return { ...BASE_PREVIEW, ...PREVIEW_OVERRIDES[key] }
}
