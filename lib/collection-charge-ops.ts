import type { SupabaseClient } from '@supabase/supabase-js'
import { createGrowPaymentLink } from '@/lib/grow-client'
import {
  CLIENT_GROW_PAYMENTS_SELECT,
  isGrowCollectionsConfigured,
  type ClientGrowPaymentsRow,
} from '@/lib/grow-credentials'
import { isGrowPlatformConfigured } from '@/lib/grow-config'
import { sendResidentSMS } from '@/lib/sms-send'
import { getPublicAppUrl } from '@/lib/public-app-url'
import {
  buildPaymentSmsBody,
  type CollectionChargeRow,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'
import { sendCollectionReceiptEmailIfNeeded } from '@/lib/collection-receipt-email'

export type ChargeResidentInfo = {
  id: string
  full_name: string
  phone: string | null
  normalized_phone: string | null
  apartment_number: string | null
  email?: string | null
}

export type ChargeProjectInfo = {
  id: string
  name: string
}

function nowIso(): string {
  return new Date().toISOString()
}

export function buildGrowWebhookNotifyUrl(): string | null {
  const base = getPublicAppUrl()
  const secret = (process.env.GROW_WEBHOOK_SECRET || '').trim()
  if (!base || !secret) return null
  const url = new URL(`${base}/api/webhook/grow`)
  url.searchParams.set('token', secret)
  return url.toString()
}

/** Absolute webhook URL Bino registers on each Grow payment request. */
export function getConfiguredGrowWebhookUrl(): {
  ok: true
  url: string
} | {
  ok: false
  error: string
} {
  const url = buildGrowWebhookNotifyUrl()
  if (!url) {
    return {
      ok: false,
      error:
        'חסר GROW_WEBHOOK_SECRET או NEXT_PUBLIC_APP_URL בשרת. הגדירו ב-Vercel.',
    }
  }
  return { ok: true, url }
}

/** @deprecated use buildGrowWebhookNotifyUrl */
export function buildGreenInvoiceWebhookNotifyUrl(): string | null {
  return buildGrowWebhookNotifyUrl()
}

/** @deprecated use getConfiguredGrowWebhookUrl */
export function getConfiguredGreenInvoiceWebhookUrl(): {
  ok: true
  url: string
} | {
  ok: false
  error: string
} {
  return getConfiguredGrowWebhookUrl()
}

export function buildPublicPayUrl(publicToken: string): string {
  const base = getPublicAppUrl()
  const path = `/pay/${encodeURIComponent(publicToken)}`
  return base ? `${base}${path}` : path
}

export function defaultSuccessFailureUrls(
  _row: ClientGrowPaymentsRow,
  opts?: { publicToken?: string | null }
): {
  successUrl: string
  failureUrl: string
} {
  const base = getPublicAppUrl()
  const token = (opts?.publicToken || '').trim()
  const successDefault = base
    ? token
      ? `${base}/pay/success?t=${encodeURIComponent(token)}`
      : `${base}/pay/success`
    : '/pay/success'
  const failureDefault = base
    ? token
      ? `${base}/pay/failure?t=${encodeURIComponent(token)}`
      : `${base}/pay/failure`
    : '/pay/failure'
  return { successUrl: successDefault, failureUrl: failureDefault }
}

export async function loadClientCollectionsRow(
  admin: SupabaseClient,
  clientId: string
): Promise<ClientCollectionsRow | null> {
  const { data, error } = await admin
    .from('clients')
    .select(`${CLIENT_GROW_PAYMENTS_SELECT}, sms_sender_name, name, logo_url`)
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return null
  return data as ClientCollectionsRow
}

/** @deprecated use loadClientCollectionsRow */
export async function loadClientGreenInvoiceRow(
  admin: SupabaseClient,
  clientId: string
): Promise<ClientCollectionsRow | null> {
  return loadClientCollectionsRow(admin, clientId)
}

export type ClientCollectionsRow = ClientGrowPaymentsRow & {
  sms_sender_name?: string | null
  name?: string | null
  logo_url?: string | null
}

export function requireConfiguredCredentials(row: ClientGrowPaymentsRow): {
  ok: true
  userId: string
} | { ok: false; error: string } {
  if (!isGrowPlatformConfigured()) {
    return {
      ok: false,
      error: 'חסרים מפתחות Grow של Bino בשרת. פנו להנהלת Bino.',
    }
  }
  if (!isGrowCollectionsConfigured(row)) {
    return {
      ok: false,
      error:
        'חשבון Grow שלכם לא מוגדר. היכנסו להגדרות → Grow, הפעילו חיבור והדביקו את ה-userId אחרי ההצטרפות.',
    }
  }
  return { ok: true, userId: row.grow_user_id!.trim() }
}

function residentPhone(resident: ChargeResidentInfo | null | undefined): string | null {
  const raw = resident?.normalized_phone?.trim() || resident?.phone?.trim() || ''
  return raw || null
}

function paymentDescription(opts: {
  title: string
  apartment?: string | null
  projectName?: string | null
}): string {
  const parts = [opts.title.trim()]
  if (opts.apartment?.trim()) parts.push(`דירה ${opts.apartment.trim()}`)
  if (opts.projectName?.trim()) parts.push(opts.projectName.trim())
  return parts.filter(Boolean).join(' · ')
}

export type SendChargeResult =
  | {
      ok: true
      charge: CollectionChargeRow
      smsSent: boolean
      payUrl: string
    }
  | { ok: false; error: string; code?: string }

/** Create Grow payment request, mark sent, optionally SMS the Bino pay link. */
export async function sendCollectionCharge(
  admin: SupabaseClient,
  opts: {
    clientId: string
    charge: CollectionChargeRow
    resident: ChargeResidentInfo | null
    project: ChargeProjectInfo | null
    clientRow: ClientCollectionsRow
    sendSms?: boolean
  }
): Promise<SendChargeResult> {
  const { charge, resident, project, clientRow, clientId } = opts
  const sendSms = opts.sendSms !== false

  if (charge.status === 'paid') {
    return { ok: false, error: 'החיוב כבר שולם', code: 'ALREADY_PAID' }
  }
  if (charge.status === 'cancelled') {
    return { ok: false, error: 'החיוב בוטל', code: 'CANCELLED' }
  }

  const notifyUrl = buildGrowWebhookNotifyUrl()
  if (!notifyUrl) {
    return {
      ok: false,
      error:
        'לא ניתן לשלוח חיוב: חסר GROW_WEBHOOK_SECRET בשרת. בלי זה סטטוס «שולם» לא יתעדכן אחרי תשלום.',
      code: 'WEBHOOK_SECRET_MISSING',
    }
  }

  const creds = requireConfiguredCredentials(clientRow)
  if (!creds.ok) return { ok: false, error: creds.error, code: 'NOT_CONFIGURED' }

  let paymentUrl = charge.grow_payment_url || charge.greeninvoice_payment_url
  let paymentLinkId = charge.grow_payment_link_id

  if (!paymentUrl) {
    const phone = residentPhone(resident)
    if (!phone) {
      return { ok: false, error: 'לדייר אין מספר טלפון — דרוש לדרישת תשלום ב-Grow', code: 'NO_PHONE' }
    }
    const { successUrl, failureUrl } = defaultSuccessFailureUrls(clientRow, {
      publicToken: charge.public_token,
    })
    const description = paymentDescription({
      title: charge.title,
      apartment: resident?.apartment_number,
      projectName: project?.name,
    })

    const form = await createGrowPaymentLink({
      userId: creds.userId,
      title: description,
      amount: Number(charge.amount),
      fullName: resident?.full_name || 'דייר',
      phone,
      email: resident?.email,
      successUrl,
      cancelUrl: failureUrl,
      notifyUrl,
      publicToken: charge.public_token,
    })

    if (!form.ok) {
      await admin
        .from('collection_charges')
        .update({
          status: 'failed' satisfies CollectionChargeStatus,
          updated_at: nowIso(),
        })
        .eq('id', charge.id)
        .eq('client_id', clientId)
      return { ok: false, error: form.error || 'יצירת דרישת תשלום נכשלה', code: 'FORM_FAILED' }
    }

    paymentUrl = form.url
    paymentLinkId = form.paymentLinkProcessId || null
  }

  const publicPayUrl = buildPublicPayUrl(charge.public_token)
  const phone = residentPhone(resident)
  let smsSent = false

  if (sendSms) {
    if (!phone) {
      smsSent = false
    } else {
      const body = buildPaymentSmsBody({
        residentName: resident?.full_name || '',
        title: charge.title,
        amount: Number(charge.amount),
        payUrl: publicPayUrl,
      })
      smsSent = await sendResidentSMS(
        phone,
        body,
        clientRow.sms_sender_name ?? null,
        clientId
      )
    }
  }

  const sentAt = charge.sent_at || nowIso()
  const { data: updated, error } = await admin
    .from('collection_charges')
    .update({
      status: 'sent' satisfies CollectionChargeStatus,
      grow_payment_url: paymentUrl,
      grow_payment_link_id: paymentLinkId,
      greeninvoice_payment_url: paymentUrl,
      sent_at: sentAt,
      updated_at: nowIso(),
    })
    .eq('id', charge.id)
    .eq('client_id', clientId)
    .select('*')
    .single()

  if (error || !updated) {
    return { ok: false, error: error?.message || 'עדכון החיוב נכשל', code: 'UPDATE_FAILED' }
  }

  return {
    ok: true,
    charge: updated as CollectionChargeRow,
    smsSent,
    payUrl: publicPayUrl,
  }
}

/** Resend SMS for an already-sent charge that has a payment URL. */
export async function resendCollectionChargeSms(
  admin: SupabaseClient,
  opts: {
    clientId: string
    charge: CollectionChargeRow
    resident: ChargeResidentInfo | null
    clientRow: ClientCollectionsRow
  }
): Promise<{ ok: true; smsSent: boolean; payUrl: string } | { ok: false; error: string }> {
  const { charge, resident, clientRow, clientId } = opts
  if (!charge.grow_payment_url && !charge.greeninvoice_payment_url && charge.status !== 'sent' && charge.status !== 'draft') {
    if (charge.status === 'paid') return { ok: false, error: 'החיוב כבר שולם' }
    if (charge.status === 'cancelled') return { ok: false, error: 'החיוב בוטל' }
  }
  if (!charge.grow_payment_url && !charge.greeninvoice_payment_url && !charge.public_token) {
    return { ok: false, error: 'אין קישור תשלום לחיוב זה' }
  }

  const payUrl = buildPublicPayUrl(charge.public_token)
  const phone = residentPhone(resident)
  if (!phone) return { ok: false, error: 'לדייר אין מספר טלפון' }

  const body = buildPaymentSmsBody({
    residentName: resident?.full_name || '',
    title: charge.title,
    amount: Number(charge.amount),
    payUrl,
  })
  const smsSent = await sendResidentSMS(
    phone,
    body,
    clientRow.sms_sender_name ?? null,
    clientId
  )
  if (!smsSent) return { ok: false, error: 'שליחת SMS נכשלה' }

  if (charge.status === 'draft' && (charge.grow_payment_url || charge.greeninvoice_payment_url)) {
    await admin
      .from('collection_charges')
      .update({
        status: 'sent' satisfies CollectionChargeStatus,
        sent_at: charge.sent_at || nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', charge.id)
      .eq('client_id', clientId)
  }

  return { ok: true, smsSent, payUrl }
}

export async function cancelCollectionCharge(
  admin: SupabaseClient,
  opts: { clientId: string; chargeId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select('*')
    .eq('id', opts.chargeId)
    .eq('client_id', opts.clientId)
    .maybeSingle()

  if (error || !charge) return { ok: false, error: 'חיוב לא נמצא' }
  const row = charge as CollectionChargeRow
  if (row.status === 'paid') return { ok: false, error: 'לא ניתן לבטל חיוב ששולם' }
  if (row.status === 'cancelled') return { ok: true }

  // Invalidate Bino public link; keep Grow link id so a late webhook can still match.
  const { error: updErr } = await admin
    .from('collection_charges')
    .update({
      status: 'cancelled' satisfies CollectionChargeStatus,
      grow_payment_url: null,
      greeninvoice_payment_url: null,
      public_token: crypto.randomUUID(),
      updated_at: nowIso(),
    })
    .eq('id', opts.chargeId)
    .eq('client_id', opts.clientId)

  if (updErr) return { ok: false, error: updErr.message }
  return { ok: true }
}

/** Manual ops recovery when webhook missed a real payment. */
export async function markCollectionChargePaidManual(
  admin: SupabaseClient,
  opts: { clientId: string; chargeId: string }
): Promise<{ ok: true; charge: CollectionChargeRow } | { ok: false; error: string }> {
  const { data: charge, error } = await admin
    .from('collection_charges')
    .select('*')
    .eq('id', opts.chargeId)
    .eq('client_id', opts.clientId)
    .maybeSingle()

  if (error || !charge) return { ok: false, error: 'חיוב לא נמצא' }
  const row = charge as CollectionChargeRow
  if (row.status === 'cancelled') {
    return { ok: false, error: 'לא ניתן לסמן חיוב מבוטל כשולם' }
  }
  if (row.status === 'paid') {
    return { ok: true, charge: row }
  }

  const paidAt = nowIso()
  const { data: updated, error: updErr } = await admin
    .from('collection_charges')
    .update({
      status: 'paid' satisfies CollectionChargeStatus,
      paid_at: paidAt,
      updated_at: paidAt,
    })
    .eq('id', opts.chargeId)
    .eq('client_id', opts.clientId)
    .select('*')
    .single()

  if (updErr || !updated) {
    return { ok: false, error: updErr?.message || 'עדכון ל«שולם» נכשל' }
  }
  void sendCollectionReceiptEmailIfNeeded(admin, opts.chargeId).catch(() => {})
  return { ok: true, charge: updated as CollectionChargeRow }
}

export async function markChargePaidByGrowIds(
  admin: SupabaseClient,
  ids: { publicTokens: string[]; paymentLinkIds: string[]; transactionIds: string[] }
): Promise<{ matched: number; newlyPaidIds: string[] }> {
  const tokens = [...new Set(ids.publicTokens.filter(Boolean))]
  const linkIds = [...new Set(ids.paymentLinkIds.filter(Boolean))]
  const txIds = [...new Set(ids.transactionIds.filter(Boolean))]
  if (tokens.length === 0 && linkIds.length === 0 && txIds.length === 0) {
    return { matched: 0, newlyPaidIds: [] }
  }

  let matched = 0
  const paidAt = nowIso()
  const newlyPaidIds: string[] = []
  const txPatch =
    txIds.length === 1 ? { grow_transaction_id: txIds[0] } : {}

  const applyPaid = async (filter: { column: string; values: string[] }) => {
    const { data } = await admin
      .from('collection_charges')
      .update({
        status: 'paid' satisfies CollectionChargeStatus,
        paid_at: paidAt,
        updated_at: paidAt,
        ...txPatch,
      })
      .in(filter.column, filter.values)
      .neq('status', 'paid')
      .select('id')
    matched += data?.length ?? 0
    for (const row of data ?? []) {
      if (!newlyPaidIds.includes(row.id)) newlyPaidIds.push(row.id)
    }
  }

  if (tokens.length > 0) await applyPaid({ column: 'public_token', values: tokens })
  if (linkIds.length > 0) await applyPaid({ column: 'grow_payment_link_id', values: linkIds })

  for (const id of newlyPaidIds) {
    void sendCollectionReceiptEmailIfNeeded(admin, id).catch(() => {})
  }

  return { matched, newlyPaidIds }
}

/** Keep matching in-flight Morning charges until Grow fully replaces them. */
export async function markChargePaidByMorningIds(
  admin: SupabaseClient,
  ids: { paymentIds: string[]; documentIds: string[] }
): Promise<{ matched: number }> {
  const uniquePaymentIds = [...new Set(ids.paymentIds.filter(Boolean))]
  const uniqueDocIds = [...new Set(ids.documentIds.filter(Boolean))]
  if (uniquePaymentIds.length === 0 && uniqueDocIds.length === 0) {
    return { matched: 0 }
  }

  let matched = 0
  const paidAt = nowIso()
  const newlyPaidIds: string[] = []

  if (uniquePaymentIds.length > 0) {
    const { data } = await admin
      .from('collection_charges')
      .update({
        status: 'paid' satisfies CollectionChargeStatus,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .in('greeninvoice_payment_id', uniquePaymentIds)
      .neq('status', 'paid')
      .select('id')
    matched += data?.length ?? 0
    for (const row of data ?? []) newlyPaidIds.push(row.id)
  }

  if (uniqueDocIds.length > 0) {
    const { data } = await admin
      .from('collection_charges')
      .update({
        status: 'paid' satisfies CollectionChargeStatus,
        paid_at: paidAt,
        updated_at: paidAt,
      })
      .in('greeninvoice_document_id', uniqueDocIds)
      .neq('status', 'paid')
      .select('id')
    matched += data?.length ?? 0
    for (const row of data ?? []) {
      if (!newlyPaidIds.includes(row.id)) newlyPaidIds.push(row.id)
    }
  }

  for (const id of newlyPaidIds) {
    void sendCollectionReceiptEmailIfNeeded(admin, id).catch(() => {})
  }

  return { matched }
}
