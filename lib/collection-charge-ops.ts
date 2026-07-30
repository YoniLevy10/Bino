import type { SupabaseClient } from '@supabase/supabase-js'
import { getGreenInvoicePaymentForm } from '@/lib/greeninvoice-client'
import {
  CLIENT_GREENINVOICE_SELECT,
  credentialsFromClientRow,
  isGreenInvoiceConfigured,
  type ClientGreenInvoiceRow,
} from '@/lib/greeninvoice-credentials'
import { sendResidentSMS } from '@/lib/sms-send'
import { getPublicAppUrl } from '@/lib/public-app-url'
import {
  buildPaymentSmsBody,
  type CollectionChargeRow,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'

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

export function buildGreenInvoiceWebhookNotifyUrl(): string | null {
  const base = getPublicAppUrl()
  const secret = (process.env.GREENINVOICE_WEBHOOK_SECRET || '').trim()
  if (!base) return null
  const url = new URL(`${base}/api/webhook/greeninvoice`)
  if (secret) url.searchParams.set('token', secret)
  return url.toString()
}

export function buildPublicPayUrl(publicToken: string): string {
  const base = getPublicAppUrl()
  const path = `/pay/${encodeURIComponent(publicToken)}`
  return base ? `${base}${path}` : path
}

export function defaultSuccessFailureUrls(row: ClientGreenInvoiceRow): {
  successUrl: string
  failureUrl: string
} {
  const base = getPublicAppUrl()
  const success =
    row.greeninvoice_payment_success_url?.trim() ||
    (base ? `${base}/pay/success` : '/pay/success')
  const failure =
    row.greeninvoice_payment_failure_url?.trim() ||
    (base ? `${base}/pay/failure` : '/pay/failure')
  return { successUrl: success, failureUrl: failure }
}

export async function loadClientGreenInvoiceRow(
  admin: SupabaseClient,
  clientId: string
): Promise<ClientGreenInvoiceRow | null> {
  const { data, error } = await admin
    .from('clients')
    .select(`${CLIENT_GREENINVOICE_SELECT}, sms_sender_name, name, logo_url`)
    .eq('id', clientId)
    .maybeSingle()
  if (error || !data) return null
  return data as ClientGreenInvoiceRow & {
    sms_sender_name?: string | null
    name?: string | null
    logo_url?: string | null
  }
}

export type ClientCollectionsRow = ClientGreenInvoiceRow & {
  sms_sender_name?: string | null
  name?: string | null
  logo_url?: string | null
}

export function requireConfiguredCredentials(row: ClientGreenInvoiceRow): {
  ok: true
  credentials: NonNullable<ReturnType<typeof credentialsFromClientRow>>
} | { ok: false; error: string } {
  if (!isGreenInvoiceConfigured(row)) {
    return {
      ok: false,
      error:
        'חשבונית ירוקה (Morning) לא מוגדרת. היכנסו להגדרות → חשבונית ירוקה והזינו מפתחות API.',
    }
  }
  const credentials = credentialsFromClientRow(row)
  if (!credentials) {
    return {
      ok: false,
      error:
        'חסרים מפתחות Morning. היכנסו להגדרות → חשבונית ירוקה והשלימו את ההגדרה.',
    }
  }
  return { ok: true, credentials }
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

/** Create Morning payment form, mark sent, optionally SMS the Bamakor pay link. */
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

  const creds = requireConfiguredCredentials(clientRow)
  if (!creds.ok) return { ok: false, error: creds.error, code: 'NOT_CONFIGURED' }

  // Already has payment URL — resend path should use resend; but allow re-form if missing
  let paymentUrl = charge.greeninvoice_payment_url
  let paymentId = charge.greeninvoice_payment_id
  const greeninvoiceClientId = charge.greeninvoice_client_id

  if (!paymentUrl) {
    const { successUrl, failureUrl } = defaultSuccessFailureUrls(clientRow)
    const notifyUrl = buildGreenInvoiceWebhookNotifyUrl()
    const description = paymentDescription({
      title: charge.title,
      apartment: resident?.apartment_number,
      projectName: project?.name,
    })

    const clientPayload =
      resident != null
        ? {
            name: resident.full_name.trim() || 'דייר',
            phone: residentPhone(resident) || undefined,
            emails: resident.email?.trim() ? [resident.email.trim()] : undefined,
            add: true as const,
          }
        : undefined

    const form = await getGreenInvoicePaymentForm(creds.credentials, {
      description,
      amount: Number(charge.amount),
      currency: charge.currency || 'ILS',
      client: clientPayload,
      successUrl,
      failureUrl,
      notifyUrl,
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
      return { ok: false, error: form.error || 'יצירת טופס תשלום נכשלה', code: 'FORM_FAILED' }
    }

    paymentUrl = form.data.url || null
    paymentId = form.data.paymentId || null
    if (!paymentUrl) {
      return { ok: false, error: 'Morning לא החזיר קישור תשלום', code: 'NO_URL' }
    }
  }

  const publicPayUrl = buildPublicPayUrl(charge.public_token)
  const phone = residentPhone(resident)
  let smsSent = false

  if (sendSms) {
    if (!phone) {
      // Still mark sent — link exists; caller can copy
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
      greeninvoice_payment_url: paymentUrl,
      greeninvoice_payment_id: paymentId,
      greeninvoice_client_id: greeninvoiceClientId,
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
  if (!charge.greeninvoice_payment_url && charge.status !== 'sent' && charge.status !== 'draft') {
    if (charge.status === 'paid') return { ok: false, error: 'החיוב כבר שולם' }
    if (charge.status === 'cancelled') return { ok: false, error: 'החיוב בוטל' }
  }
  if (!charge.greeninvoice_payment_url && !charge.public_token) {
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

  if (charge.status === 'draft' && charge.greeninvoice_payment_url) {
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

  const { error: updErr } = await admin
    .from('collection_charges')
    .update({
      status: 'cancelled' satisfies CollectionChargeStatus,
      updated_at: nowIso(),
    })
    .eq('id', opts.chargeId)
    .eq('client_id', opts.clientId)

  if (updErr) return { ok: false, error: updErr.message }
  return { ok: true }
}

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
  }

  return { matched }
}
