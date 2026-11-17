import type { SupabaseClient } from '@supabase/supabase-js'
import { isIcountCollectionsPlatformEnabled } from '@/lib/icount-config'

export type CollectionsPaymentProvider = 'grow' | 'icount'

export type ClientIcountPaymentsRow = {
  icount_enabled?: boolean | null
  icount_cid?: string | null
  icount_api_token?: string | null
  icount_paypage_id?: string | null
  collections_payment_provider?: string | null
}

/** Safe for settings UI — never includes api token. */
export const CLIENT_ICOUNT_PAYMENTS_SAFE_SELECT =
  'icount_enabled, icount_cid, icount_paypage_id, collections_payment_provider'

export const CLIENT_ICOUNT_PAYMENTS_SECRET_SELECT =
  'icount_enabled, icount_cid, icount_api_token, icount_paypage_id, collections_payment_provider'

export type IcountCredentials = {
  cid: string
  apiToken: string
  paypageId: string
}

export function normalizeIcountCid(raw: string | null | undefined): string | null {
  const v = (raw || '').trim()
  return v || null
}

export function normalizeIcountPaypageId(raw: string | null | undefined): string | null {
  const v = (raw || '').trim()
  return v || null
}

export function normalizeIcountApiToken(raw: string | null | undefined): string | null {
  const v = (raw || '').trim()
  return v || null
}

export function normalizeCollectionsPaymentProvider(
  raw: string | null | undefined
): CollectionsPaymentProvider {
  return raw === 'icount' ? 'icount' : 'grow'
}

export function icountCredentialsFromRow(
  row: ClientIcountPaymentsRow
): IcountCredentials | null {
  const cid = normalizeIcountCid(row.icount_cid)
  const apiToken = normalizeIcountApiToken(row.icount_api_token)
  const paypageId = normalizeIcountPaypageId(row.icount_paypage_id)
  if (!cid || !apiToken || !paypageId) return null
  return { cid, apiToken, paypageId }
}

export function isIcountCollectionsConfigured(row: ClientIcountPaymentsRow): boolean {
  return row.icount_enabled === true && Boolean(icountCredentialsFromRow(row))
}

export function shouldUseIcountCollections(row: ClientIcountPaymentsRow): boolean {
  if (!isIcountCollectionsPlatformEnabled()) return false
  if (normalizeCollectionsPaymentProvider(row.collections_payment_provider) !== 'icount') {
    return false
  }
  return isIcountCollectionsConfigured(row)
}

export type IcountCollectionsCheck = {
  id: 'platform' | 'enabled' | 'cid' | 'token' | 'paypage' | 'provider'
  label: string
  ok: boolean
  required: boolean
}

export type IcountCollectionsAccountStatus = {
  ready: boolean
  checks: IcountCollectionsCheck[]
  message: string
}

export function buildIcountCollectionsAccountStatus(opts: {
  platformEnabled: boolean
  enabled: boolean
  cid: string | null | undefined
  hasToken: boolean
  paypageId: string | null | undefined
  provider: CollectionsPaymentProvider
}): IcountCollectionsAccountStatus {
  const cidOk = Boolean(opts.cid?.trim())
  const paypageOk = Boolean(opts.paypageId?.trim())
  const providerOk = opts.provider === 'icount'
  const checks: IcountCollectionsCheck[] = [
    {
      id: 'platform',
      label: 'דגל פלטפורמה ICOUNT_COLLECTIONS_ENABLED',
      ok: opts.platformEnabled,
      required: true,
    },
    {
      id: 'provider',
      label: 'ספק גבייה = iCount (לא Grow)',
      ok: providerOk,
      required: true,
    },
    {
      id: 'enabled',
      label: 'חיבור iCount מופעל בחשבון',
      ok: opts.enabled,
      required: true,
    },
    {
      id: 'cid',
      label: 'מזהה חברה iCount (cid)',
      ok: cidOk,
      required: true,
    },
    {
      id: 'token',
      label: 'טוקן API של iCount',
      ok: opts.hasToken,
      required: true,
    },
    {
      id: 'paypage',
      label: 'מזהה דף תשלום (paypage_id)',
      ok: paypageOk,
      required: true,
    },
  ]
  const ready =
    opts.platformEnabled &&
    providerOk &&
    opts.enabled &&
    cidOk &&
    opts.hasToken &&
    paypageOk

  let message = 'החשבון מוכן לגבייה ב־iCount — הכסף נכנס לפי מסוף/חשבון שהוגדר ב־iCount.'
  if (!opts.platformEnabled) {
    message = 'דגל ICOUNT_COLLECTIONS_ENABLED כבוי בשרת — Grow נשאר פעיל.'
  } else if (!providerOk) {
    message = 'ספק הגבייה עדיין Grow. העבירו collections_payment_provider ל־icount אחרי בדיקת IPN.'
  } else if (!cidOk || !opts.hasToken || !paypageOk) {
    message = 'חסרים cid / טוקן API / paypage_id בהגדרות iCount.'
  } else if (!opts.enabled) {
    message = 'פרטי iCount שמורים — הפעילו icount_enabled כדי לשלוח חיובים.'
  }
  return { ready, checks, message }
}

export function assertTenantCanEnableIcount(opts: {
  enabled: boolean
  cid: string | null | undefined
  hasToken: boolean
  paypageId: string | null | undefined
}): { ok: true } | { ok: false; error: string } {
  if (!opts.enabled) return { ok: true }
  if (!opts.cid?.trim() || !opts.hasToken || !opts.paypageId?.trim()) {
    return {
      ok: false,
      error: 'להפעלת iCount יש להזין cid, טוקן API ו־paypage_id.',
    }
  }
  return { ok: true }
}

export async function loadClientIcountCredentials(
  admin: SupabaseClient,
  clientId: string
): Promise<
  | { ok: true; enabled: boolean; creds: IcountCredentials | null; row: ClientIcountPaymentsRow }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from('clients')
    .select(CLIENT_ICOUNT_PAYMENTS_SECRET_SELECT)
    .eq('id', clientId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'client not found' }

  const row = data as ClientIcountPaymentsRow
  return {
    ok: true,
    enabled: row.icount_enabled === true,
    creds: icountCredentialsFromRow(row),
    row,
  }
}
