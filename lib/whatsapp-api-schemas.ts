import { z } from 'zod'

export const whatsappSendBodySchema = z.object({
  phone: z.string().min(8).max(20),
  body: z.string().min(1).max(4096),
  conversation_id: z.string().uuid().optional(),
})

export const whatsappSendTemplateBodySchema = z.object({
  phone: z.string().min(8).max(20),
  template_id: z.string().min(1).max(80),
  params: z.array(z.string().max(500)).max(5),
  conversation_id: z.string().uuid().optional(),
})

export const whatsappSessionQuerySchema = z.object({
  phone: z.string().min(8).max(20),
})

/** Manager reply to ticket reporter via WhatsApp (ticket drawer). */
export const whatsappReplyResidentBodySchema = z.object({
  ticket_id: z.string().uuid(),
  body: z.string().min(1).max(4096),
})

export const smsCampaignBodySchema = z.object({
  project_id: z.string().uuid(),
  campaign_name: z.string().max(120).optional(),
  message_body: z.string().min(1).max(900),
  dry_run: z.boolean().optional(),
})

export const documentSignRequestBodySchema = z
  .object({
    project_id: z.string().uuid(),
    document_id: z.string().uuid().optional(),
    document_path: z.string().min(1).optional(),
    document_name: z.string().min(1).max(200),
    signer_name: z.string().max(120).optional(),
    signer_phone: z.string().max(20).optional(),
    signer_email: z.string().email().optional().or(z.literal('')),
    sign_url: z.string().url().optional(),
    send_via: z.enum(['sms', 'whatsapp', 'none']).optional(),
  })
  .refine((d) => Boolean(d.document_id || d.document_path), {
    message: 'document_id or document_path required',
  })

export const emailSendBodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
})

export const waBroadcastBodySchema = z.object({
  project_id: z.string().uuid(),
  /** Catalog id (ticket_closed, sla_escalation) — preferred */
  template_id: z.string().min(1).max(80).optional(),
  body_params: z.array(z.string().max(500)).max(5).optional(),
  /** Legacy: raw Meta template name */
  template_name: z.string().min(1).max(120).optional(),
  template_language: z.string().max(10).optional(),
  body_param: z.string().max(500).optional(),
  dry_run: z.boolean().optional(),
  /** Required when sending (not dry_run) — manager confirms Meta policy */
  ack_wa_policy: z.literal(true).optional(),
}).refine((d) => Boolean(d.template_id?.trim() || d.template_name?.trim()), {
  message: 'template_id or template_name required',
})
