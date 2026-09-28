import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  buildGrowWebhookNotifyUrl,
  defaultSuccessFailureUrls,
  loadClientCollectionsRow,
  requireConfiguredCredentials,
} from '@/lib/collection-charge-ops'
import {
  buildGrowInvoiceNotifyUrl,
  createGrowPaymentProcess,
} from '@/lib/grow-client'
import { growSdkEnvironment, readGrowPlatformConfig } from '@/lib/grow-config'
import { z } from 'zod'
import { formatZodError } from '@/lib/format-zod-error'

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

const bodySchema = z.object({
  full_name: z.string().min(2).max(80).optional(),
  phone: z.string().min(9).max(20).optional(),
  email: z.string().email().max(200).optional().nullable(),
})

/**
 * Create Grow wallet session immediately before opening the SDK.
 * Does NOT mark the charge paid — only S2S webhook + Approve does.
 */
export async function POST(req: Request, context: RouteContext) {
  const { token } = await context.params
  const publicToken = parseToken(token)
  if (!publicToken) {
    return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
  }

  const platform = readGrowPlatformConfig()
  if (!platform) {
    return NextResponse.json({ error: 'תשלומים לא מוגדרים בשרת' }, { status: 503 })
  }

  const notifyUrl = buildGrowWebhookNotifyUrl()
  if (!notifyUrl) {
    return NextResponse.json({ error: 'חסר מסלול עדכון סטטוס בשרת' }, { status: 503 })
  }

  const raw = await req.json().catch(() => ({}))
  const validated = bodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const rl = await checkIpPostRouteLimit(admin, clientIp(req), 'public-pay-wallet')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { data: charge, error } = await admin
    .from('collection_charges')
    .select(
      `
      id, client_id, title, amount, status, public_token,
      residents ( full_name, phone, normalized_phone, email )
    `
    )
    .eq('public_token', publicToken)
    .maybeSingle()

  if (error || !charge) {
    return NextResponse.json({ error: 'חיוב לא נמצא' }, { status: 404 })
  }

  if (charge.status === 'paid') {
    return NextResponse.json({ error: 'החיוב כבר שולם', code: 'ALREADY_PAID' }, { status: 409 })
  }
  if (charge.status === 'cancelled') {
    return NextResponse.json({ error: 'החיוב בוטל', code: 'CANCELLED' }, { status: 409 })
  }

  const clientRow = await loadClientCollectionsRow(admin, charge.client_id)
  if (!clientRow) {
    return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  }
  const creds = requireConfiguredCredentials(clientRow)
  if (!creds.ok) {
    return NextResponse.json({ error: creds.error }, { status: 403 })
  }

  const residentRaw = charge.residents as
    | { full_name: string; phone: string | null; normalized_phone: string | null; email: string | null }
    | { full_name: string; phone: string | null; normalized_phone: string | null; email: string | null }[]
    | null
  const resident = Array.isArray(residentRaw) ? residentRaw[0] : residentRaw

  const fullName =
    validated.data.full_name?.trim() || resident?.full_name || 'דייר דירה'
  const phone =
    validated.data.phone?.trim() ||
    resident?.normalized_phone ||
    resident?.phone ||
    ''
  if (!phone) {
    return NextResponse.json({ error: 'נדרש מספר טלפון לפתיחת הארנק' }, { status: 400 })
  }

  const { successUrl, failureUrl } = defaultSuccessFailureUrls(clientRow, {
    publicToken: charge.public_token,
  })

  const process = await createGrowPaymentProcess({
    userId: creds.userId,
    title: charge.title,
    amount: Number(charge.amount),
    fullName,
    phone,
    email: validated.data.email ?? resident?.email,
    successUrl,
    cancelUrl: failureUrl,
    notifyUrl,
    invoiceNotifyUrl: buildGrowInvoiceNotifyUrl(),
    publicToken: charge.public_token,
  })

  if (!process.ok) {
    return NextResponse.json({ error: process.error }, { status: 502 })
  }

  const now = new Date().toISOString()
  await admin
    .from('collection_charges')
    .update({
      grow_process_id: process.processId || null,
      grow_process_token: process.processToken,
      status: charge.status === 'draft' ? 'sent' : charge.status,
      sent_at: charge.status === 'draft' ? now : undefined,
      updated_at: now,
    })
    .eq('id', charge.id)

  return NextResponse.json({
    ok: true,
    authCode: process.authCode,
    processId: process.processId,
    sdkEnvironment: growSdkEnvironment(platform.env),
    /** Browser must NOT treat this as paid — wait for S2S webhook. */
    doNotMarkPaidClientSide: true,
  })
}
