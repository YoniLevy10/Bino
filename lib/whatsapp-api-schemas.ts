import { z } from 'zod'

export const whatsappSendBodySchema = z.object({
  phone: z.string().min(8).max(20),
  body: z.string().min(1).max(4096),
  conversation_id: z.string().uuid().optional(),
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

export const assistantQueryBodySchema = z.object({
  question: z.string().min(2).max(500),
})

export const emailSendBodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(8000),
})

export const waBroadcastBodySchema = z.object({
  project_id: z.string().uuid(),
  template_name: z.string().min(1).max(120),
  template_language: z.string().max(10).optional(),
  body_param: z.string().max(500).optional(),
  dry_run: z.boolean().optional(),
})
