import { sendResendEmail } from '@/lib/email-resend'
import { formatChargeAmountIls } from '@/lib/collection-charges'
import { normalizeReceiptEmail } from '@/lib/collection-receipt-email'
import type { SupabaseClient } from '@supabase/supabase-js'

export type InvoiceEmailContext = {
  title: string
  amount: number
  invoiceUrl: string
  invoiceId?: string | null
  client_name?: string | null
  resident_name?: string | null
  apartment_number?: string | null
  project_name?: string | null
}

export function buildGrowInvoiceEmailBody(ctx: InvoiceEmailContext): {
  subject: string
  body: string
} {
  const clientName = (ctx.client_name || 'Bino').trim()
  const amountLabel = formatChargeAmountIls(Number(ctx.amount))
  const lines = [
    `שלום${ctx.resident_name ? ` ${ctx.resident_name}` : ''},`,
    '',
    `מצורפת חשבונית עבור: ${ctx.title}`,
    `סכום: ${amountLabel}`,
  ]
  if (ctx.apartment_number?.trim()) lines.push(`דירה: ${ctx.apartment_number.trim()}`)
  if (ctx.project_name?.trim()) lines.push(`בניין: ${ctx.project_name.trim()}`)
  if (ctx.invoiceId?.trim()) lines.push(`מספר חשבונית: ${ctx.invoiceId.trim()}`)
  lines.push('', `לצפייה בחשבונית:`, ctx.invoiceUrl, '', `מאת: ${clientName}`, '', 'Bino')

  return {
    subject: `חשבונית — ${ctx.title} — ${amountLabel}`,
    body: lines.join('\n'),
  }
}

/**
 * After Grow invoiceNotifyUrl webhook: email the invoice URL once (Resend).
 * Uses receipt_email, else resident email.
 */
export async function sendCollectionInvoiceEmailIfNeeded(
  admin: SupabaseClient,
  chargeId: string
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const { data, error } = await admin
    .from('collection_charges')
    .select(
      `
      id, title, amount, status,
      receipt_email, grow_invoice_id, grow_invoice_url, grow_invoice_email_sent_at,
      clients ( name ),
      residents ( full_name, apartment_number, email ),
      projects ( name )
    `
    )
    .eq('id', chargeId)
    .maybeSingle()

  if (error || !data) {
    return { sent: false, error: error?.message || 'charge not found' }
  }

  const row = data as unknown as {
    id: string
    title: string
    amount: number
    status: string
    receipt_email: string | null
    grow_invoice_id: string | null
    grow_invoice_url: string | null
    grow_invoice_email_sent_at: string | null
    clients: { name: string } | { name: string }[] | null
    residents:
      | { full_name: string; apartment_number: string | null; email: string | null }
      | { full_name: string; apartment_number: string | null; email: string | null }[]
      | null
    projects: { name: string } | { name: string }[] | null
  }

  if (row.grow_invoice_email_sent_at) {
    return { sent: false, skipped: 'already_sent' }
  }

  const invoiceUrl = (row.grow_invoice_url || '').trim()
  if (!invoiceUrl) {
    return { sent: false, skipped: 'no_invoice_url' }
  }

  const resident = Array.isArray(row.residents) ? row.residents[0] : row.residents
  const email =
    normalizeReceiptEmail(row.receipt_email) || normalizeReceiptEmail(resident?.email || null)
  if (!email) {
    return { sent: false, skipped: 'no_email' }
  }

  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects

  const { subject, body } = buildGrowInvoiceEmailBody({
    title: row.title,
    amount: Number(row.amount),
    invoiceUrl,
    invoiceId: row.grow_invoice_id,
    client_name: client?.name,
    resident_name: resident?.full_name,
    apartment_number: resident?.apartment_number,
    project_name: project?.name,
  })

  const result = await sendResendEmail({ to: email, subject, body })
  if (!result.ok) {
    console.error('[invoice-email]', chargeId, result.error)
    return { sent: false, error: result.error }
  }

  const now = new Date().toISOString()
  await admin
    .from('collection_charges')
    .update({ grow_invoice_email_sent_at: now, updated_at: now })
    .eq('id', chargeId)
    .is('grow_invoice_email_sent_at', null)

  return { sent: true }
}
