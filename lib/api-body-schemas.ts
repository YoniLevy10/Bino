import { z } from 'zod'
import { sidebarNavOrderSchema } from '@/lib/sidebar-nav'
import { TICKET_STATUSES } from '@/lib/ticket-status'

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
  email: z.string().email({ message: 'נדרש אימייל תקין' }),
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

export const projectPilotSmsBodySchema = z.object({
  project_id: z.string().uuid(),
  dry_run: z.boolean().optional(),
})

export const deleteProjectDocumentBodySchema = z.object({
  document_id: z.string().uuid(),
})
