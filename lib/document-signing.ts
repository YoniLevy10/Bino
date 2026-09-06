import type { SupabaseClient } from '@supabase/supabase-js'
import { send019StaffSms } from '@/lib/sms'
import { sendWhatsAppTextMessageWithCredentials } from '@/lib/whatsapp-send'

export type CreateSignRequestInput = {
  clientId: string
  projectId: string
  documentPath: string
  documentName: string
  signerName?: string
  signerPhone?: string
  signerEmail?: string
  signUrl?: string
  sendVia?: 'sms' | 'whatsapp' | 'none'
}

export async function createDocumentSignRequest(
  admin: SupabaseClient,
  input: CreateSignRequestInput
) {
  const signUrl = input.signUrl?.trim() || null

  const { data: row, error } = await admin
    .from('document_sign_requests')
    .insert({
      client_id: input.clientId,
      project_id: input.projectId,
      document_path: input.documentPath,
      document_name: input.documentName,
      signer_name: input.signerName ?? null,
      signer_phone: input.signerPhone ?? null,
      signer_email: input.signerEmail ?? null,
      provider: signUrl ? 'manual_link' : 'pending',
      sign_url: signUrl,
      status: signUrl ? 'sent' : 'pending',
      sent_at: signUrl ? new Date().toISOString() : null,
    })
    .select('id, sign_url, status')
    .single()

  if (error) throw error

  const message = signUrl
    ? `Bino: מסמך "${input.documentName}" לחתימה: ${signUrl}`
    : null

  if (message && input.sendVia === 'sms' && input.signerPhone) {
    await send019StaffSms(input.signerPhone, message, null, {
      channel: 'document_sign',
      clientId: input.clientId,
    })
  }

  if (message && input.sendVia === 'whatsapp' && input.signerPhone) {
    const { data: clientRow } = await admin
      .from('clients')
      .select('whatsapp_phone_number_id, whatsapp_access_token')
      .eq('id', input.clientId)
      .maybeSingle()
    const pid = (clientRow as { whatsapp_phone_number_id?: string } | null)?.whatsapp_phone_number_id
    const token = (clientRow as { whatsapp_access_token?: string } | null)?.whatsapp_access_token
    if (pid && token) {
      await sendWhatsAppTextMessageWithCredentials(pid, token, input.signerPhone, message)
    }
  }

  return row
}
