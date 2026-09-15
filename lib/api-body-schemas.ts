import { z } from 'zod'
import { sidebarNavOrderSchema, sidebarNavLabelsSchema } from '@/lib/sidebar-nav'
import { TICKET_STATUSES } from '@/lib/ticket-status'

/** Beacon for dashboard tab analytics (optional nav_id; server can derive from path). */
export const pageViewBodySchema = z.object({
  path: z.string().min(1).max(200),
  nav_id: z.string().min(1).max(80).optional(),
})

/** שיוך תקלה לעובד (לוח בקרה). */
export const assignWorkerBodySchema = z.object({
  ticket_id: z.string().uuid(),
  worker_id: z.string().uuid(),
})

/** עדכון תקלה מלוח הבקרה — לפחות שדה אחד. */
export const updateTicketBodySchema = z
  .object({
    ticket_id: z.string().uuid(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    status: z.enum(TICKET_STATUSES).optional(),
    description: z.string().max(20000).optional(),
    assigned_worker_id: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .refine(
    (v) =>
      v.priority !== undefined ||
      v.status !== undefined ||
      v.description !== undefined ||
      v.assigned_worker_id !== undefined,
    { message: 'נדרש לפחות שדה אחד לעדכון' }
  )

export const updateWorkerBodySchema = z
  .object({
    worker_id: z.string().uuid(),
    full_name: z.string().min(1).max(200).optional(),
    phone: z.string().min(6).max(40).optional(),
    extra_phones: z.array(z.string().min(6).max(40)).max(5).optional(),
    email: z.union([z.string().email().max(320), z.literal(''), z.null()]).optional(),
    role: z.string().max(100).nullable().optional(),
    is_active: z.boolean().optional(),
    hourly_rate: z.number().min(0).max(99999).nullable().optional(),
    soft_delete: z.literal(true).optional(),
  })
  .refine(
    (v) =>
      v.soft_delete === true ||
      v.full_name !== undefined ||
      v.phone !== undefined ||
      v.extra_phones !== undefined ||
      v.email !== undefined ||
      v.role !== undefined ||
      v.is_active !== undefined,
    { message: 'נדרש לפחות שדה אחד לעדכון' }
  )

export const updateProjectBodySchema = z
  .object({
    project_id: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    project_code: z.string().min(1).max(40).optional(),
    address: z.string().max(500).nullable().optional(),
    address_en: z.string().max(500).nullable().optional(),
    qr_identifier: z.string().max(200).nullable().optional(),
    is_active: z.boolean().optional(),
    assigned_worker_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.project_code !== undefined ||
      v.address !== undefined ||
      v.address_en !== undefined ||
      v.qr_identifier !== undefined ||
      v.is_active !== undefined ||
      v.assigned_worker_id !== undefined,
    { message: 'נדרש לפחות שדה אחד לעדכון' }
  )

export const updateResidentBodySchema = z.object({
  resident_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  full_name: z.string().min(1).max(200).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.union([z.string().email().max(320), z.literal(''), z.null()]).optional(),
  is_renter: z.boolean().optional(),
  apartment_number: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  soft_delete: z.literal(true).optional(),
})

export const mergeResidentsBodySchema = z.object({
  keep_resident_id: z.string().uuid(),
  merge_resident_id: z.string().uuid(),
})

export const errorLogActionBodySchema = z.union([
  z.object({ id: z.string().uuid(), action: z.literal('resolve') }),
  z.object({ action: z.literal('delete_resolved') }),
])

export const whatsappTemplateRowSchema = z.object({
  template_key: z.string().min(1).max(120),
  template_text: z.string().max(8000),
})

export const saveWhatsappTemplatesBodySchema = z.object({
  templates: z.array(whatsappTemplateRowSchema).min(1).max(80),
})

export const ticketInternalMessageBodySchema = z.object({
  ticket_id: z.string().uuid(),
  sender_name: z.string().min(1).max(120),
  body: z.string().min(1).max(8000),
})

export const sidebarPinBodySchema = z.object({
  addon_key: z.enum([
    'calendar',
    'professionals',
    'worker_stamp',
    'pilot_sms',
    'project_documents',
    'whatsapp_inbox',
    'campaigns',
    'collections',
  ]),
  pinned: z.boolean(),
})

export const settingsUpdateBodySchema = z
  .object({
    manager_phone: z.string().max(40).nullable().optional(),
    default_worker_phone: z.string().max(40).nullable().optional(),
    sms_sender_name: z.string().max(80).nullable().optional(),
    sms_on_ticket_open: z.boolean().optional(),
    sms_on_ticket_close: z.boolean().optional(),
    whatsapp_business_phone: z.string().max(40).nullable().optional(),
    whatsapp_phone_number_id: z.string().max(80).nullable().optional(),
    whatsapp_access_token: z.string().max(500).nullable().optional(),
    sidebar_nav_order: sidebarNavOrderSchema.optional(),
    sidebar_nav_labels: sidebarNavLabelsSchema.optional(),
    grow_legal_business_name: z.string().max(120).nullable().optional(),
    grow_legal_phone: z.string().max(40).nullable().optional(),
    grow_legal_address: z.string().max(300).nullable().optional(),
    grow_legal_email: z.string().max(200).nullable().optional(),
    grow_enabled: z.boolean().optional(),
    grow_user_id: z.string().max(80).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'אין שדות לעדכון' })

/** גוף JSON ל-create-ticket: דף דיווח (project/building) או זרימת WhatsApp דרך API (טלפון). */
export const createTicketJsonBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  project_code: z.string().max(40).optional(),
  building_id: z.string().uuid().optional(),
  message: z.string().max(8000).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  reporter_name: z.string().max(255).nullable().optional(),
  reporter_phone: z.string().max(40).nullable().optional(),
  building_number: z.string().max(80).nullable().optional(),
  source: z.string().max(80).optional(),
  client_id: z.string().uuid().optional(),
})

export const ticketIdBodySchema = z.object({
  ticket_id: z.string().uuid(),
})

export const mergeTicketsBodySchema = z.object({
  source_ticket_id: z.string().uuid(),
  target_ticket_id: z.string().uuid(),
})

/** Alternative merge API shape (aliases). */
export const mergeTicketsByIdBodySchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
})

export const notifyReporterClosedBodySchema = ticketIdBodySchema

export const translateTicketBodySchema = z.object({
  text: z.string().min(2).max(50000),
  target_lang: z.string().min(2).max(12).optional(),
})

export const createProjectBodySchema = z.object({
  organization_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  project_code: z.string().min(1).max(40),
  address: z.string().max(500).nullable().optional(),
  address_en: z.string().max(500).nullable().optional(),
  qr_identifier: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
  assigned_worker_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
})

export const deleteProjectBodySchema = z.object({
  project_id: z.string().uuid(),
})

export const createWorkerBodySchema = z.object({
  full_name: z.string().min(1).max(200),
  phone: z.string().min(6).max(40),
  extra_phones: z.array(z.string().min(6).max(40)).max(5).optional(),
  email: z.union([z.string().email({ message: 'נדרש אימייל תקין' }).max(320), z.literal(''), z.null()]).optional(),
  role: z.string().max(100).nullable().optional(),
  is_active: z.boolean().optional(),
  organization_id: z.string().uuid().optional(),
})

export const onboardingOrganizationBodySchema = z.object({
  name: z.string().min(1).max(200),
})

export const onboardingProjectBodySchema = z.object({
  name: z.string().min(1).max(200),
  project_code: z.string().min(1).max(40),
})

export const pendingResidentsApproveBodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  full_name: z.string().max(200).optional(),
  apartment_number: z.string().max(20).optional(),
})

export const pushSubscribeBodySchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(10),
      auth: z.string().min(10),
    }),
  }),
  client_id: z.string().uuid().optional(),
})

/** Worker portal push — authenticated via access token, not Supabase session. */
export const workerPushSubscribeBodySchema = z.object({
  token: z.string().uuid(),
  subscription: pushSubscribeBodySchema.shape.subscription,
})

/** Worker push unsubscribe — token required; subscription/endpoint optional for full revoke. */
export const workerPushUnsubscribeBodySchema = z.object({
  token: z.string().uuid(),
  subscription: pushSubscribeBodySchema.shape.subscription.optional(),
  endpoint: z.string().url().optional(),
})

/** Worker WhatsApp reply to ticket reporter from personal portal. */
export const workerWhatsappReplyBodySchema = z.object({
  token: z.string().uuid(),
  ticket_id: z.string().uuid(),
  body: z.string().min(1).max(4096),
})

/** Worker PATCH ticket status from token portal. */
export const workerUpdateTicketBodySchema = z.object({
  token: z.string().uuid(),
  ticket_id: z.string().uuid(),
  status: z.enum([
    'NEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_PARTS',
    'SITE_TOUR',
    'PROFESSIONAL_ESCORT',
    'CLOSED',
  ]),
})

/** Worker logs a site tour (no ticket). */
export const workerLogTourBodySchema = z.object({
  token: z.string().uuid(),
  project_id: z.string().uuid(),
  completed_at: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
})

export const settingsTestWhatsAppBodySchema = z
  .object({
    to: z.string().min(4).max(40).optional(),
  })
  .passthrough()

export const importResidentsBodySchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(5000),
  dryRun: z.boolean().optional(),
})

export const createResidentBodySchema = z.object({
  project_id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  phone: z.string().max(40).nullable().optional(),
  email: z.union([z.string().email().max(320), z.literal('')]).nullable().optional(),
  is_renter: z.boolean().optional(),
  apartment_number: z.string().max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

/** Public resident intake survey (max ~5 fields). Phone required. */
export const publicResidentIntakeBodySchema = z.object({
  client_id: z.string().uuid(),
  project_code: z.string().min(1).max(40),
  full_name: z.string().min(1).max(200),
  phone: z.string().min(6).max(40),
  apartment_number: z.string().min(1).max(20),
  email: z.union([z.string().email().max(320), z.literal('')]).nullable().optional(),
  is_renter: z.boolean().optional(),
})

/** שליחת קישור לאזור האישי של עובד שטח ב-SMS. */
export const sendWorkerPortalLinkBodySchema = z.object({
  worker_id: z.string().uuid(),
})

export const createProfessionalBodySchema = z.object({
  full_name: z.string().min(1).max(200),
  phone: z.string().min(6).max(40),
  extra_phones: z.array(z.string().min(6).max(40)).max(5).optional(),
  trade: z.string().max(100).nullable().optional(),
  company_name: z.string().max(200).nullable().optional(),
  email: z.union([z.string().email().max(320), z.literal('')]).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  is_active: z.boolean().optional(),
})

export const updateProfessionalBodySchema = createProfessionalBodySchema.partial().extend({
  professional_id: z.string().uuid(),
})

/** העברת תקלה לאיש מקצוע חיצוני ב-SMS. */
export const forwardTicketToProfessionalBodySchema = z.object({
  ticket_id: z.string().uuid(),
  professional_id: z.string().uuid(),
  note: z.string().max(500).nullable().optional(),
  set_status_escort: z.boolean().optional(),
})

const attendanceEventTypeSchema = z.enum([
  'clock_in',
  'clock_out',
  'project_arrival',
  'project_departure',
  'project_visit',
])

export const workerAttendanceSyncBodySchema = z.object({
  access_token: z.string().uuid(),
  events: z
    .array(
      z.object({
        client_action_id: z.string().min(8).max(80),
        tag_code: z.string().min(1).max(80),
        event_type: attendanceEventTypeSchema,
        client_recorded_at: z.string().min(10).max(40),
        client_timezone: z.string().max(80).nullable().optional(),
        device_id: z.string().max(80).nullable().optional(),
        user_agent: z.string().max(500).nullable().optional(),
        lat: z.number().finite().nullable().optional(),
        lng: z.number().finite().nullable().optional(),
        note: z.string().max(500).nullable().optional(),
        source: z.enum(['online', 'offline']),
      })
    )
    .min(1)
    .max(50),
})

export const attendanceEventReviewBodySchema = z.object({
  event_id: z.string().uuid(),
  sync_status: z.enum(['synced', 'pending_review', 'conflict', 'rejected']),
  admin_note: z.string().max(2000).nullable().optional(),
})

export const createNfcTagBodySchema = z.object({
  tag_code: z.string().min(2).max(80),
  tag_type: z.enum(['office', 'project']),
  project_id: z.string().uuid().nullable().optional(),
  label: z.string().max(200).nullable().optional(),
  is_active: z.boolean().optional(),
})

export const patchWorkerAttendanceShiftBodySchema = z
  .object({
    started_at: z.string().datetime({ offset: true }).optional(),
    ended_at: z.string().datetime({ offset: true }).nullable().optional(),
    total_minutes: z.number().int().min(0).max(24 * 60).optional(),
    status: z.enum(['open', 'closed', 'missing_checkout', 'edited', 'pending_review']).optional(),
    admin_note: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (v) =>
      v.started_at !== undefined ||
      v.ended_at !== undefined ||
      v.total_minutes !== undefined ||
      v.status !== undefined ||
      v.admin_note !== undefined,
    { message: 'נדרש לפחות שדה אחד' }
  )

export const createWorkerAttendanceShiftBodySchema = z.object({
  worker_id: z.string().uuid(),
  started_at: z.string().datetime({ offset: true }),
  ended_at: z.string().datetime({ offset: true }).nullable().optional(),
  total_minutes: z.number().int().min(0).max(24 * 60).optional(),
  status: z.enum(['open', 'closed', 'missing_checkout', 'edited', 'pending_review']).optional(),
  admin_note: z.string().max(2000).nullable().optional(),
})

export const sendWorkerAttendanceLinksBodySchema = z.object({
  worker_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  send_all_active: z.boolean().optional(),
})

export const patchNfcStickerBodySchema = z.object({
  tag_id: z.string().uuid(),
  installed: z.boolean(),
})

export const patchNfcTagActiveBodySchema = z.object({
  tag_id: z.string().uuid(),
  is_active: z.boolean(),
})

export const deleteNfcTagBodySchema = z.object({
  tag_id: z.string().uuid(),
})

const calendarEventTypeSchema = z.enum(['committee', 'professional', 'internal', 'other'])

export const createCalendarEventBodySchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  all_day: z.boolean().optional(),
  project_id: z.string().uuid().nullable().optional(),
  event_type: calendarEventTypeSchema.optional(),
})

export const updateCalendarEventBodySchema = createCalendarEventBodySchema.partial().extend({
  id: z.string().uuid(),
})

export const projectPilotSmsBodySchema = z.object({
  project_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
  /** Optional custom message; default multilingual template if omitted. */
  message: z.string().min(10).max(2000).optional(),
})

export const deleteProjectDocumentBodySchema = z.object({
  document_id: z.string().uuid(),
})

/** מחיקת תקלות — נבחרות או כולן (soft delete). */
export const deleteTicketsBodySchema = z.union([
  z.object({
    ticket_ids: z.array(z.string().uuid()).min(1).max(200),
  }),
  z.object({
    delete_all: z.literal(true),
  }),
])

/** גביית ועד — יצירת חיוב בודד (טיוטה או שליחה מיידית). */
export const createCollectionChargeBodySchema = z.object({
  project_id: z.string().uuid(),
  resident_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  amount: z.number().positive().max(1_000_000),
  description: z.string().max(2000).nullable().optional(),
  period_label: z.string().max(40).nullable().optional(),
  send: z.boolean().optional(),
  send_sms: z.boolean().optional(),
})

export const sendCollectionChargeBodySchema = z.object({
  charge_id: z.string().uuid(),
  send_sms: z.boolean().optional(),
})

export const resendCollectionChargeBodySchema = z.object({
  charge_id: z.string().uuid(),
})

export const cancelCollectionChargeBodySchema = z.object({
  charge_id: z.string().uuid(),
})

export const markCollectionChargePaidBodySchema = z.object({
  charge_id: z.string().uuid(),
})

/** Public /pay page — contact for email receipt (Resend; no SMS cost). */
export const publicPayReceiptContactBodySchema = z
  .object({
    email: z.string().max(200).nullable().optional(),
    phone: z.string().max(40).nullable().optional(),
  })
  .refine(
    (v) =>
      (typeof v.email === 'string' && v.email.trim().length > 0) ||
      (typeof v.phone === 'string' && v.phone.trim().length > 0),
    { message: 'נא להזין מייל או טלפון לקבלת אישור' }
  )

const bulkSendItemSchema = z.object({
  resident_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
})

/** גביית ועד — יצירה + שליחה מרוכזת לפרויקט. */
export const bulkSendCollectionChargesBodySchema = z.object({
  project_id: z.string().uuid(),
  period_label: z.string().max(40).nullable().optional(),
  title_template: z.string().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  items: z.array(bulkSendItemSchema).min(1).max(500),
  send_sms: z.boolean().optional(),
})
