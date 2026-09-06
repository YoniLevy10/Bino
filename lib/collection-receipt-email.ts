import { sendResendEmail } from '@/lib/email-resend'
import { formatChargeAmountIls } from '@/lib/collection-charges'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ReceiptChargeContext = {
  id: string
  title: string
  amount: number
  currency: string
  paid_at: string | null
  receipt_email: string | null
  receipt_email_sent_at: string | null
  client_name?: string | null
  resident_name?: string | null
  apartment_number?: string | null
  project_name?: string | null
}

export function normalizeReceiptEmail(raw: string | null | undefined): string | null {
  const v = (raw || '').trim().toLowerCase()
  if (!v) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 200) return null
  return v
}

export function buildPaymentReceiptEmailBody(ctx: ReceiptChargeContext): {
  subject: string
  body: string
} {
  const clientName = (ctx.client_name || 'Bino').trim()
  const amountLabel = formatChargeAmountIls(Number(ctx.amount))
  const when = ctx.paid_at
    ? new Date(ctx.paid_at).toLocaleString('he-IL', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })

  const lines = [
    `שלום${ctx.resident_name ? ` ${ctx.resident_name}` : ''},`,
    '',
    `התקבל תשלום עבור: ${ctx.title}`,
    `סכום: ${amountLabel}`,
    `תאריך: ${when}`,
  ]
  if (ctx.apartment_number?.trim()) lines.push(`דירה: ${ctx.apartment_number.trim()}`)
  if (ctx.project_name?.trim()) lines.push(`בניין: ${ctx.project_name.trim()}`)
  lines.push('', `מאת: ${clientName}`, '', 'זוהי הודעת אישור תשלום. שמרו אותה לתיעוד.', '', 'Bino')

  return {
    subject: `אישור תשלום — ${ctx.title} — ${amountLabel}`,
    body: lines.join('\n'),
  }
}

/**
 * Send payment confirmation email once per charge (idempotent).
 * Uses Resend — no 019 SMS cost.
 */
export async function sendCollectionReceiptEmailIfNeeded(
  admin: SupabaseClient,
  chargeId: string
): Promise<{ sent: boolean; skipped?: string; error?: string }> {
  const { data, error } = await admin
    .from('collection_charges')
    .select(
      `
      id, title, amount, currency, paid_at, status,
      receipt_email, receipt_email_sent_at,
      clients ( name ),
      residents ( full_name, apartment_number ),
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
    currency: string
    paid_at: string | null
    status: string
    receipt_email: string | null
    receipt_email_sent_at: string | null
    clients: { name: string } | { name: string }[] | null
    residents: { full_name: string; apartment_number: string | null } | { full_name: string; apartment_number: string | null }[] | null
    projects: { name: string } | { name: string }[] | null
  }

  if (row.status !== 'paid') {
    return { sent: false, skipped: 'not_paid' }
  }
  if (row.receipt_email_sent_at) {
    return { sent: false, skipped: 'already_sent' }
  }

  const email = normalizeReceiptEmail(row.receipt_email)
  if (!email) {
    return { sent: false, skipped: 'no_email' }
  }

  const client = Array.isArray(row.clients) ? row.clients[0] : row.clients
  const resident = Array.isArray(row.residents) ? row.residents[0] : row.residents
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects

  const { subject, body } = buildPaymentReceiptEmailBody({
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    currency: row.currency,
    paid_at: row.paid_at,
    receipt_email: email,
    receipt_email_sent_at: null,
    client_name: client?.name,
    resident_name: resident?.full_name,
    apartment_number: resident?.apartment_number,
    project_name: project?.name,
  })

  const result = await sendResendEmail({ to: email, subject, body })
  if (!result.ok) {
    console.error('[receipt-email]', chargeId, result.error)
    return { sent: false, error: result.error }
  }

  const now = new Date().toISOString()
  await admin
    .from('collection_charges')
    .update({ receipt_email_sent_at: now, updated_at: now })
    .eq('id', chargeId)
    .is('receipt_email_sent_at', null)

  return { sent: true }
}
