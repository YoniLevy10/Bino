import { z } from 'zod'

/** שיוך תקלה לעובד (לוח בקרה). */
export const assignWorkerBodySchema = z.object({
  ticket_id: z.string().uuid(),
  worker_id: z.string().uuid(),
})

/** עדכון תקלה — לפחות סטטוס או עדיפות. */
export const updateTicketBodySchema = z
  .object({
    ticket_id: z.string().uuid(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    status: z.enum(['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_PARTS', 'CLOSED']).optional(),
  })
  .refine((v) => v.priority !== undefined || v.status !== undefined, {
    message: 'נדרש status או priority',
  })

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
