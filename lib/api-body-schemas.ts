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
    /** Building WhatsApp group invite (chat.whatsapp.com/…) — null clears. */
    whatsapp_group_invite_url: z.string().max(500).nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.project_code !== undefined ||
      v.address !== undefined ||
      v.address_en !== undefined ||
      v.qr_identifier !== undefined ||
      v.is_active !== undefined ||
      v.assigned_worker_id !== undefined ||
      v.whatsapp_group_invite_url !== undefined,
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
    wa_notify_resident_on_status_change: z.boolean().optional(),
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
  project_code: z.string().max(40).optional(),
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
  notes: z.string().max(2000).optional(),
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
  personal_rating: z.number().int().min(1).max(5).nullable().optional(),
  personal_note: z.string().max(2000).nullable().optional(),
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

export const maintenanceTaskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'DONE'])
export const maintenanceTaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])

export const createMaintenanceTaskBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  assigned_worker_id: z.string().uuid().nullable().optional(),
  priority: maintenanceTaskPrioritySchema.optional(),
  due_at: z.string().min(10).max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source_ticket_id: z.string().uuid().nullable().optional(),
})

export const updateMaintenanceTaskBodySchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  assigned_worker_id: z.string().uuid().nullable().optional(),
  priority: maintenanceTaskPrioritySchema.optional(),
  status: maintenanceTaskStatusSchema.optional(),
  due_at: z.string().min(10).max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source_ticket_id: z.string().uuid().nullable().optional(),
})

export const workerMaintenanceTaskCreateBodySchema = z.object({
  token: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  project_id: z.string().uuid(),
  priority: maintenanceTaskPrioritySchema.optional(),
  source_ticket_id: z.string().uuid().nullable().optional(),
})

export const workerMaintenanceTaskUpdateBodySchema = z.object({
  token: z.string().uuid(),
  task_id: z.string().uuid(),
  status: maintenanceTaskStatusSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export const workerEscortBodySchema = z.object({
  token: z.string().uuid(),
  ticket_id: z.string().uuid(),
  note: z.string().max(1000).nullable().optional(),
})

export const workerNotifyPrefsBodySchema = z.object({
  worker_id: z.string().uuid(),
  notify_sms: z.boolean().optional(),
  notify_whatsapp: z.boolean().optional(),
  notify_push: z.boolean().optional(),
  can_mark_professional_escort: z.boolean().optional(),
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

/** כרטסת דירה — תשלום חלקי / מלא מול חיוב קיים. */
export const postUnitLedgerPaymentBodySchema = z.object({
  charge_id: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  payment_method: z
    .enum(['cash', 'transfer', 'check', 'other', 'grow'])
    .optional()
    .nullable(),
  receipt_note: z.string().max(500).optional().nullable(),
  idempotency_key: z.string().min(1).max(128).optional().nullable(),
})

/** כרטסת דירה — יתרת זכות (זיכוי) ליחידה / דייר. */
export const postUnitLedgerCreditBodySchema = z
  .object({
    project_id: z.string().uuid(),
    unit_id: z.string().uuid().optional().nullable(),
    resident_id: z.string().uuid().optional().nullable(),
    amount: z.number().positive().max(1_000_000),
    description: z.string().max(300).optional().nullable(),
    receipt_note: z.string().max(500).optional().nullable(),
    idempotency_key: z.string().min(1).max(128).optional().nullable(),
  })
  .refine((v) => Boolean(v.unit_id || v.resident_id), {
    message: 'נא לבחור דירה (unit_id) או דייר',
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

/** המלצות ניהוליות — דחייה למועד */
export const snoozeRecommendationBodySchema = z.object({
  id: z.string().uuid(),
  until: z.string().datetime({ offset: true }).or(z.string().min(10).max(40)),
})

export const dismissRecommendationBodySchema = z.object({
  id: z.string().uuid(),
})

export const recommendationActionBodySchema = z.object({
  id: z.string().uuid(),
  action_id: z.string().min(1).max(80),
})

export const setProfessionalFollowUpBodySchema = z.object({
  ticket_id: z.string().uuid(),
  follow_up_at: z.string().datetime({ offset: true }).or(z.string().min(10).max(40)).nullable(),
  recommendation_id: z.string().uuid().optional(),
})

export const midragSearchOpenedBodySchema = z.object({
  ticket_id: z.string().uuid().nullable().optional(),
  recommendation_id: z.string().uuid().nullable().optional(),
  sector_id: z.number().int().nullable().optional(),
  city_id: z.number().int().nullable().optional(),
  url: z.string().max(2000).optional(),
})

/** Building finance — create expense (Wave 3 Phase 1). */
export const createBuildingExpenseBodySchema = z.object({
  project_id: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category_id: z.string().uuid().nullable().optional(),
  vendor_name: z.string().max(200).nullable().optional(),
  professional_id: z.string().uuid().nullable().optional(),
  ticket_id: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  /** Absolute URL or durable `storage:…` path from receipt upload. */
  receipt_url: z
    .string()
    .max(2000)
    .refine(
      (v) => /^https?:\/\//i.test(v) || v.startsWith('storage:'),
      'receipt_url must be https URL or storage: path'
    )
    .nullable()
    .optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid']).optional(),
  budget_period_key: z
    .string()
    .regex(/^[0-9]{4}(-Q[1-4]|-[0-9]{2})?$/)
    .nullable()
    .optional(),
  idempotency_key: z.string().min(8).max(120),
})

/** Building finance — create expense category. */
export const createBuildingExpenseCategoryBodySchema = z.object({
  name_he: z.string().trim().min(1).max(80),
  key: z
    .string()
    .regex(/^[a-z0-9_]{2,40}$/)
    .optional(),
  project_id: z.string().uuid().nullable().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
})

/** Building finance — upsert annual/period budget. */
export const upsertBuildingBudgetBodySchema = z.object({
  project_id: z.string().uuid(),
  period_key: z.string().regex(/^[0-9]{4}(-Q[1-4]|-[0-9]{2})?$/),
  amount_planned: z.number().min(0).max(100_000_000),
  category_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

const committeeRoleSchema = z.enum(['chair', 'treasurer', 'secretary', 'member', 'signer'])

/** Wave 4 — add committee member. */
export const createCommitteeMemberBodySchema = z.object({
  project_id: z.string().uuid(),
  full_name: z.string().trim().min(1).max(200),
  role: committeeRoleSchema.optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  term_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  term_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  resident_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Send service SMS/WA invite (default: auto for signer/chair when auto-notify on). */
  send_invite: z.boolean().optional(),
})

/** Wave 4 — update / end committee member. */
export const updateCommitteeMemberBodySchema = z
  .object({
    id: z.string().uuid(),
    project_id: z.string().uuid(),
    full_name: z.string().trim().min(1).max(200).optional(),
    role: committeeRoleSchema.optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional(),
    term_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    term_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.full_name !== undefined ||
      v.role !== undefined ||
      v.phone !== undefined ||
      v.email !== undefined ||
      v.term_start !== undefined ||
      v.term_end !== undefined ||
      v.notes !== undefined ||
      v.is_active !== undefined,
    { message: 'נדרש לפחות שדה אחד לעדכון' }
  )

/** Wave 4 — create building decision. */
export const createBuildingDecisionBodySchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().max(8000).nullable().optional(),
  majority_threshold: z.number().gt(0).lte(1).optional(),
  required_signatures: z.number().int().min(1).max(500).optional(),
  status: z.enum(['draft', 'open']).optional(),
  /** Optional project_documents id (PDF) attached for resident viewing before sign. */
  document_id: z.string().uuid().nullable().optional(),
  /** Create + notify signature links for committee members with phones (default true when open). */
  fanout_committee: z.boolean().optional(),
})

/** Wave 4 — patch open/draft decision threshold / required / title. */
export const updateBuildingDecisionBodySchema = z
  .object({
    project_id: z.string().uuid(),
    decision_id: z.string().uuid(),
    title: z.string().trim().min(1).max(300).optional(),
    body: z.string().trim().max(8000).nullable().optional(),
    majority_threshold: z.number().gt(0).lte(1).optional(),
    /** Manual override only when eligible voters are unavailable (server may ignore if eligible > 0). */
    required_signatures: z.number().int().min(1).max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.title === undefined &&
      v.body === undefined &&
      v.majority_threshold === undefined &&
      v.required_signatures === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'נדרש לפחות שדה אחד לעדכון',
      })
    }
  })

/** Wave 4 — create signature request for a decision. */
export const createSignatureRequestBodySchema = z.object({
  project_id: z.string().uuid(),
  decision_id: z.string().uuid(),
  signer_name: z.string().trim().min(1).max(200),
  signer_phone: z.string().trim().max(40).nullable().optional(),
  expires_in_days: z.number().int().min(1).max(90).optional(),
  /** Auto-send sign link via SMS/WA (default true when phone present + auto-notify on). */
  send_notify: z.boolean().optional(),
})

/** Hub — send decision to selected/all residents via SMS and/or email (portal deep link). */
export const notifyBuildingDecisionResidentsBodySchema = z
  .object({
    project_id: z.string().uuid(),
    decision_id: z.string().uuid(),
    /** When true, ignore resident_ids and notify all project residents (capped). */
    all_residents: z.boolean().optional(),
    resident_ids: z.array(z.string().uuid()).max(80).optional(),
    /**
     * Delivery channels. Empty = create signature stubs + recipient rows only
     * (portal can still sign without SMS/email).
     */
    channels: z.array(z.enum(['sms', 'email'])).max(2).optional().default([]),
    /**
     * When false, never send SMS/email even if channels are set — still create
     * signature stubs + building_decision_recipients. Default true.
     */
    send_messages: z.boolean().optional(),
    /** Append public /intake/building-sign/{token} as secondary link (default false). */
    include_public_fallback: z.boolean().optional(),
    expires_in_days: z.number().int().min(1).max(90).optional(),
    limit: z.number().int().min(1).max(80).optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.all_residents && (!val.resident_ids || val.resident_ids.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'נא לבחור דיירים או לסמן «כל דיירי הבניין»',
        path: ['resident_ids'],
      })
    }
  })

/** Hub — remind pending signers (SMS/email; WA only inside Meta 24h session). */
export const remindBuildingDecisionBodySchema = z.object({
  project_id: z.string().uuid(),
  decision_id: z.string().uuid(),
  channels: z.array(z.enum(['sms', 'email'])).min(1).max(2).optional(),
  send_messages: z.boolean().optional(),
  limit: z.number().int().min(1).max(40).optional(),
})

/** Hub — attach optional project document (PDF) to a decision for summary link. */
export const attachBuildingDecisionDocumentBodySchema = z.object({
  project_id: z.string().uuid(),
  decision_id: z.string().uuid(),
  document_id: z.string().uuid().nullable(),
})

/** Resident portal — submit signature for a building decision. */
export const residentSignBuildingDecisionBodySchema = z.object({
  signature_data_url: z
    .string()
    .min(32)
    .max(900_000)
    .refine((v) => v.startsWith('data:image/'), { message: 'נדרש חתימה כ־data URL' }),
  /** Default approve when omitted (backward compat with signature-only clients). */
  vote_choice: z.enum(['approve', 'oppose', 'abstain']).optional(),
})

/** Hub — batch resident portal join invites. */
export const residentJoinInviteBatchBodySchema = z.object({
  project_id: z.string().uuid(),
  resident_ids: z.array(z.string().uuid()).max(40).optional(),
  limit: z.number().int().min(1).max(40).optional(),
})

/** Wave 4 — public submit signature (token URL). */
export const submitBuildingSignatureBodySchema = z.object({
  signature_data_url: z
    .string()
    .min(32)
    .max(900_000)
    .refine((v) => v.startsWith('data:image/'), { message: 'נדרש חתימה כ־data URL' }),
  signer_name: z.string().trim().min(1).max(200).optional(),
  /** Default approve when omitted. */
  vote_choice: z.enum(['approve', 'oppose', 'abstain']).optional(),
})

/** Superadmin — create UTILITY WhatsApp template via Composio → Meta (service only). */
export const createMetaWhatsappTemplateBodySchema = z.object({
  spec_id: z.string().trim().min(1).max(80),
  /** Optional client label → Meta name suffix (ticket_closed_client). */
  name_suffix: z.string().trim().max(60).nullable().optional(),
  /** Optional customized body; must keep {{n}} placeholders. */
  body_override: z.string().trim().max(1024).nullable().optional(),
  /** Override COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID (alias or id). */
  connected_account_id: z.string().trim().max(120).nullable().optional(),
  language: z.string().trim().max(16).nullable().optional(),
})
