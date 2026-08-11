import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { formatChargeAmountIls } from '@/lib/collection-charges'

type RouteContext = { params: Promise<{ token: string }> }

export async function GET(_req: Request, context: RouteContext) {
  const { token } = await context.params
  const publicToken = (token || '').trim()
  if (!publicToken || !/^[0-9a-f-]{36}$/i.test(publicToken)) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select(
      `
      id, title, description, amount, currency, status, public_token,
      greeninvoice_payment_url, paid_at, sent_at,
      clients ( id, name, logo_url ),
      residents ( full_name, apartment_number ),
      projects ( name )
    `
    )
    .eq('public_token', publicToken)
    .maybeSingle()

  if (error || !charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }

  const raw = charge as unknown as {
    id: string
    title: string
    description: string | null
    amount: number
    currency: string
    status: string
    public_token: string
    greeninvoice_payment_url: string | null
    paid_at: string | null
    sent_at: string | null
    clients: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null
    residents: { full_name: string; apartment_number: string | null } | { full_name: string; apartment_number: string | null }[] | null
    projects: { name: string } | { name: string }[] | null
  }

  const client = Array.isArray(raw.clients) ? raw.clients[0] || null : raw.clients
  const resident = Array.isArray(raw.residents) ? raw.residents[0] || null : raw.residents
  const project = Array.isArray(raw.projects) ? raw.projects[0] || null : raw.projects

  const canPay =
    Boolean(raw.greeninvoice_payment_url) &&
    (raw.status === 'sent' || raw.status === 'draft' || raw.status === 'failed')

  return NextResponse.json({
    title: raw.title,
    description: raw.description,
    amount: raw.amount,
    amount_label: formatChargeAmountIls(Number(raw.amount)),
    currency: raw.currency,
    status: raw.status,
    can_pay: canPay,
    payment_url: canPay ? raw.greeninvoice_payment_url : null,
    paid_at: raw.paid_at,
    client: {
      name: client?.name || 'במקור',
      logo_url: client?.logo_url || null,
    },
    resident_name: resident?.full_name || null,
    apartment_number: resident?.apartment_number || null,
    project_name: project?.name || null,
  })
}
