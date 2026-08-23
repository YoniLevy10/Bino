import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { formatChargeAmountIls } from '@/lib/collection-charges'
import { publicPayReceiptContactBodySchema } from '@/lib/api-body-schemas'
import { formatZodError } from '@/lib/format-zod-error'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { normalizeReceiptEmail } from '@/lib/collection-receipt-email'
import { normalizePhone019 } from '@/lib/sms-019-core'
import { sendCollectionReceiptEmailIfNeeded } from '@/lib/collection-receipt-email'

type RouteContext = { params: Promise<{ token: string }> }

function parseToken(raw: string | undefined): string | null {
  const publicToken = (raw || '').trim()
  if (!publicToken || !/^[0-9a-f-]{36}$/i.test(publicToken)) return null
  return publicToken
}

function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip') || 'unknown'
}

export async function GET(_req: Request, context: RouteContext) {
  const { token } = await context.params
  const publicToken = parseToken(token)
  if (!publicToken) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select(
      `
      id, title, description, amount, currency, status, public_token,
      greeninvoice_payment_url, paid_at, sent_at,
      receipt_email, receipt_phone, receipt_email_sent_at,
      clients ( id, name, logo_url ),
      residents ( full_name, apartment_number, email, phone, normalized_phone ),
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
    receipt_email: string | null
    receipt_phone: string | null
    receipt_email_sent_at: string | null
    clients:
      | { id: string; name: string; logo_url: string | null }
      | { id: string; name: string; logo_url: string | null }[]
      | null
    residents:
      | {
          full_name: string
          apartment_number: string | null
          email: string | null
          phone: string | null
          normalized_phone: string | null
        }
      | {
          full_name: string
          apartment_number: string | null
          email: string | null
          phone: string | null
          normalized_phone: string | null
        }[]
      | null
    projects: { name: string } | { name: string }[] | null
  }

  const client = Array.isArray(raw.clients) ? raw.clients[0] || null : raw.clients
  const resident = Array.isArray(raw.residents) ? raw.residents[0] || null : raw.residents
  const project = Array.isArray(raw.projects) ? raw.projects[0] || null : raw.projects

  const canPay =
    Boolean(raw.greeninvoice_payment_url) &&
    (raw.status === 'sent' || raw.status === 'draft' || raw.status === 'failed')

  const suggestedEmail = raw.receipt_email || resident?.email || null
  const suggestedPhone =
    raw.receipt_phone || resident?.normalized_phone || resident?.phone || null

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
    receipt_email: raw.receipt_email,
    receipt_phone: raw.receipt_phone,
    receipt_email_sent: Boolean(raw.receipt_email_sent_at),
    suggested_email: suggestedEmail,
    suggested_phone: suggestedPhone,
    client: {
      name: client?.name || 'במקור',
      logo_url: client?.logo_url || null,
    },
    resident_name: resident?.full_name || null,
    apartment_number: resident?.apartment_number || null,
    project_name: project?.name || null,
  })
}

/** Save receipt contact before redirecting to Morning payment form. */
export async function PATCH(req: Request, context: RouteContext) {
  const { token } = await context.params
  const publicToken = parseToken(token)
  if (!publicToken) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const rl = await checkIpPostRouteLimit(admin, clientIp(req), 'public-pay-contact')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const rawBody = await req.json().catch(() => null)
  const parsed = publicPayReceiptContactBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const emailRaw = parsed.data.email?.trim() || ''
  const phoneRaw = parsed.data.phone?.trim() || ''
  const email = emailRaw ? normalizeReceiptEmail(emailRaw) : null
  if (emailRaw && !email) {
    return NextResponse.json({ error: 'כתובת מייל לא תקינה' }, { status: 400 })
  }

  let phone: string | null = null
  if (phoneRaw) {
    phone = normalizePhone019(phoneRaw) || phoneRaw.slice(0, 40)
  }

  if (!email && !phone) {
    return NextResponse.json({ error: 'נא להזין מייל או טלפון' }, { status: 400 })
  }

  const { data: charge, error: fetchErr } = await admin
    .from('collection_charges')
    .select('id, status, greeninvoice_payment_url, receipt_email_sent_at')
    .eq('public_token', publicToken)
    .maybeSingle()

  if (fetchErr || !charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }

  if (charge.status === 'cancelled') {
    return NextResponse.json({ error: 'החיוב בוטל' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error: updErr } = await admin
    .from('collection_charges')
    .update({
      receipt_email: email,
      receipt_phone: phone,
      updated_at: now,
    })
    .eq('id', charge.id)

  if (updErr) {
    return NextResponse.json({ error: 'שמירת פרטים נכשלה' }, { status: 500 })
  }

  // If already paid (late contact save), try sending receipt now.
  if (charge.status === 'paid' && email && !charge.receipt_email_sent_at) {
    void sendCollectionReceiptEmailIfNeeded(admin, charge.id).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    receipt_email: email,
    receipt_phone: phone,
    payment_url: charge.greeninvoice_payment_url,
  })
}
