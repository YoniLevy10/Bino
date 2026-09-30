import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResidentPortalMembershipView } from '@/lib/resident-portal/types'
import type { CollectionChargeStatus } from '@/lib/collection-charges'

/** Whitelist fields safe for resident portal (no merchant tokens). */
export type ResidentChargeView = {
  id: string
  title: string
  description: string | null
  amount: number
  currency: string
  status: CollectionChargeStatus
  period_label: string | null
  due_date: string | null
  paid_at: string | null
  sent_at: string | null
  public_token: string
  can_pay: boolean
  is_overdue: boolean
  payment_pending_confirmation: boolean
  invoice: {
    available: boolean
    url: string | null
    received_at: string | null
  }
}

const RESIDENT_CHARGE_SELECT = `
  id, title, description, amount, currency, status, period_label,
  due_date, paid_at, sent_at, public_token, published_to_portal, resident_id,
  grow_invoice_url, grow_invoice_received_at, grow_approve_status
`.replace(/\s+/g, ' ').trim()

function isOverdue(row: {
  status: string
  due_date: string | null
}): boolean {
  if (row.status === 'paid' || row.status === 'cancelled' || row.status === 'draft') return false
  if (!row.due_date) return false
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const todayStr = `${y}-${m}-${d}`
  return row.due_date < todayStr
}

export async function listChargesForMembership(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView,
  opts?: { year?: number | null; month?: number | null }
): Promise<{ charges: ResidentChargeView[]; openBalance: number }> {
  // period_label filter is best-effort (YYYY-MM or Hebrew labels) — filter in JS if needed
  const { data, error } = await admin
    .from('collection_charges')
    .select(RESIDENT_CHARGE_SELECT)
    .eq('client_id', membership.client_id)
    .eq('resident_id', membership.resident_id)
    .eq('published_to_portal', true)
    .neq('status', 'draft')
    .neq('status', 'cancelled')
    .order('due_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    throw new Error(`charges list failed: ${error.message}`)
  }

  type Row = {
    id: string
    title: string
    description: string | null
    amount: number
    currency: string
    status: CollectionChargeStatus
    period_label: string | null
    due_date: string | null
    paid_at: string | null
    sent_at: string | null
    public_token: string
    grow_invoice_url: string | null
    grow_invoice_received_at: string | null
    grow_approve_status: string | null
  }

  let rows = (data ?? []) as unknown as Row[]

  if (opts?.year) {
    const prefix = `${opts.year}-${opts.month ? String(opts.month).padStart(2, '0') : ''}`
    rows = rows.filter((r) => {
      if (r.due_date?.startsWith(String(opts.year))) {
        if (opts.month) return r.due_date.startsWith(prefix)
        return true
      }
      if (r.period_label?.includes(String(opts.year))) return true
      return false
    })
  }

  const charges: ResidentChargeView[] = rows.map((r) => {
    const invoiceUrl = (r.grow_invoice_url || '').trim() || null
    const paymentPending =
      r.status !== 'paid' &&
      (r.grow_approve_status === 'pending' || r.grow_approve_status === 'processing')
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      amount: Number(r.amount),
      currency: r.currency || 'ILS',
      status: r.status,
      period_label: r.period_label,
      due_date: r.due_date,
      paid_at: r.paid_at,
      sent_at: r.sent_at,
      public_token: r.public_token,
      can_pay: r.status === 'sent' || r.status === 'failed',
      is_overdue: isOverdue(r),
      payment_pending_confirmation: paymentPending,
      invoice: {
        available: Boolean(invoiceUrl),
        url: invoiceUrl,
        received_at: r.grow_invoice_received_at,
      },
    }
  })

  const openBalance = charges
    .filter((c) => c.status === 'sent' || c.status === 'failed')
    .reduce((sum, c) => sum + c.amount, 0)

  return { charges, openBalance }
}

export async function getPayableChargeToken(
  admin: SupabaseClient,
  membership: ResidentPortalMembershipView,
  chargeId: string
): Promise<{ public_token: string } | null> {
  const { data, error } = await admin
    .from('collection_charges')
    .select('id, public_token, status, published_to_portal, resident_id, client_id')
    .eq('id', chargeId)
    .eq('client_id', membership.client_id)
    .eq('resident_id', membership.resident_id)
    .eq('published_to_portal', true)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null
  if (data.status !== 'sent' && data.status !== 'failed') return null
  return { public_token: data.public_token }
}
