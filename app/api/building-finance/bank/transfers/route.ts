import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { formatZodError } from '@/lib/errors/format-zod-error'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyTransfersEnabled } from '@/lib/bank/flags'
import { loadClientFinancyCredentials } from '@/lib/bank/financy-credentials'
import {
  createPayment,
  extractDebtorPaymentAccount,
  extractPaymentPsuIds,
  getPaymentStatus,
  inferCreditorAccountType,
  isFinancyCashAccountType,
  listMerchants,
  normalizeFinancyAccountType,
} from '@/lib/bank/financy-gateway'
import type { FinancyAccount } from '@/lib/bank/types'
import { BINO_PUBLIC_ORIGIN, getEnvPublicOrigin } from '@/lib/shared/public-origin'

export const dynamic = 'force-dynamic'

function mapRemoteStatus(status: string | undefined): string {
  const s = (status || '').toUpperCase()
  if (['ACSC', 'ACCP', 'ACSP', 'SUCC', 'SUCCESS', 'COMPLETED'].includes(s)) {
    return 'succeeded'
  }
  if (['RJCT', 'CANC', 'CANCELLED', 'CANCELED', 'FAILED'].includes(s)) {
    return s.startsWith('CAN') ? 'canceled' : 'failed'
  }
  if (['RCVD', 'PDNG', 'ACTC', 'ACWC', 'PENDING'].includes(s)) {
    return 'pending_bank'
  }
  return 'created'
}

export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyTransfersEnabled()) {
    return NextResponse.json(
      { error: 'העברות כבויות בפלטפורמה', code: 'FINANCY_TRANSFERS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  // Transfers are client-wide — ignore building project_id filters.
  const limitRaw = Number(url.searchParams.get('limit') || '50')
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 50

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('bank_transfers')
    .select(
      'id, project_id, financy_payment_id, external_id, amount, currency, description, payee_name, payee_account, status, pay_url, expense_id, created_at, updated_at'
    )
    .eq('client_id', auth.ctx.clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let merchants: Array<Record<string, unknown>> = []
  let merchants_error: string | null = null
  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (loaded.ok && loaded.enabled && loaded.creds) {
    const listed = await listMerchants(loaded.creds, { limit: 50, sort: -1 })
    if (listed.ok) merchants = listed.data.items
    else merchants_error = listed.error
  }

  return NextResponse.json({
    transfers: data || [],
    merchants,
    merchants_error,
  })
}

const createBodySchema = z
  .object({
    project_id: z.string().uuid().nullable().optional(),
    amount: z.number().positive().max(1_000_000),
    currency: z.string().max(8).default('ILS'),
    description: z.string().max(500).optional(),
    payee_name: z.string().max(200).optional(),
    payee_account: z.string().max(80).optional(),
    /** Bank-app style fields — composed to BBAN when payee_account omitted. */
    bank_code: z.string().max(8).optional(),
    branch_number: z.string().max(8).optional(),
    account_number: z.string().max(32).optional(),
    creditor_account_type: z.enum(['iban', 'bban']).optional(),
    merchant_id: z.string().max(120).optional(),
    /** Optional local bank_accounts.id — defaults to first cash (עו״ש/חיסכון) account. */
    debtor_bank_account_id: z.string().uuid().optional(),
    external_id: z.string().max(64).optional(),
    allow_business: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.merchant_id) return
    if (val.payee_name && val.payee_account) return
    if (val.payee_name && val.bank_code && val.branch_number && val.account_number) return
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'נדרש מוטב שמור, או שם מוטב + חשבון (IBAN/BBAN), או שם + בנק/סניף/מספר חשבון',
    })
  })

export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyTransfersEnabled()) {
    return NextResponse.json(
      { error: 'העברות כבויות בפלטפורמה', code: 'FINANCY_TRANSFERS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-transfer-create'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = createBodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
  if (!loaded.enabled || !loaded.creds) {
    return NextResponse.json(
      { error: 'Financy לא מוגדר', code: 'FINANCY_NOT_CONFIGURED' },
      { status: 400 }
    )
  }

  const body = validated.data
  const externalId =
    body.external_id ||
    `bino_${auth.ctx.clientId.slice(0, 8)}_${Date.now().toString(36)}`.slice(0, 30)

  const appUrl = (getEnvPublicOrigin() || BINO_PUBLIC_ORIGIN).replace(/\/$/, '')
  const redirectUrl = `${appUrl}/finance/bank?transfer=return`

  // Financy hosted PIS: payee via merchantId OR creditor* inside paymentInformation.
  const paymentInformation: Record<string, unknown> = {
    amount: body.amount,
    currency: body.currency || 'ILS',
    description: body.description || 'העברה עסקית BINO',
  }
  let resolvedPayeeAccount = body.payee_account?.replace(/\s+/g, '') || ''
  if (
    !body.merchant_id &&
    !resolvedPayeeAccount &&
    body.bank_code &&
    body.branch_number &&
    body.account_number
  ) {
    const { buildIsraeliBban } = await import('@/lib/bank-match/bban')
    const bban = buildIsraeliBban({
      bankCode: body.bank_code,
      branchNumber: body.branch_number,
      accountNumber: body.account_number,
    })
    if (!bban) {
      return NextResponse.json(
        { error: 'פרטי בנק/סניף/חשבון לא תקינים' },
        { status: 400 }
      )
    }
    resolvedPayeeAccount = bban
  }

  if (!body.merchant_id && resolvedPayeeAccount && body.payee_name) {
    paymentInformation.creditorName = body.payee_name
    paymentInformation.creditorAccountNumber = resolvedPayeeAccount
    paymentInformation.creditorAccountType =
      body.creditor_account_type ||
      inferCreditorAccountType(resolvedPayeeAccount)
  }

  // Financy PIS: at least one side must be a connected AIS account.
  // Outgoing pay-to-external-creditor → attach debtor from synced cash account.
  let debtorAccountsQuery = admin
    .from('bank_accounts')
    .select('id, account_type, raw, synced_at')
    .eq('client_id', auth.ctx.clientId)
    .eq('provider', 'financy')
    .order('synced_at', { ascending: false })
    .limit(20)
  if (body.debtor_bank_account_id) {
    debtorAccountsQuery = debtorAccountsQuery.eq('id', body.debtor_bank_account_id)
  }
  const { data: debtorRows, error: debtorLoadErr } = await debtorAccountsQuery
  if (debtorLoadErr) {
    return NextResponse.json({ error: debtorLoadErr.message }, { status: 500 })
  }
  const cashRows = (debtorRows || []).filter((row) =>
    isFinancyCashAccountType(row.account_type)
  )
  // Prefer CHECKING (עו״ש) over savings / other cash products.
  const debtorSource =
    cashRows.find((row) => normalizeFinancyAccountType(row.account_type) === 'CHECKING') ||
    cashRows[0] ||
    null
  const debtorRaw = (debtorSource?.raw || null) as FinancyAccount | null
  const debtor = extractDebtorPaymentAccount(debtorRaw)
  if (!debtor) {
    return NextResponse.json(
      {
        error:
          'לא נמצא חשבון עו״ש מחובר ב־Financy לשליחת העברה. סנכרנו בנק ואז נסו שוב.',
        code: 'FINANCY_DEBTOR_ACCOUNT_REQUIRED',
      },
      { status: 400 }
    )
  }
  paymentInformation.debtorAccountType = debtor.accountType
  paymentInformation.debtorAccountNumber = debtor.accountNumber

  const paymentBody: Record<string, unknown> = {
    redirectUrl,
    language: 'he',
    externalId,
    // Allow business accounts in the bank journey; do NOT force isBusiness —
    // that locks Financy into corporate-id fields and frozen truncated BBAN.
    allowBusiness: body.allow_business !== false,
    paymentInformation,
  }
  if (body.merchant_id) paymentBody.merchantId = body.merchant_id
  const psu = extractPaymentPsuIds(debtorRaw)
  if (psu.psuId) paymentBody.psuId = psu.psuId
  if (psu.psuCorporateId) paymentBody.psuCorporateId = psu.psuCorporateId

  const created = await createPayment(loaded.creds, paymentBody)
  if (!created.ok) {
    console.error('[bank/transfers] Financy createPayment failed', {
      status: created.status,
      error: created.error,
      hasMerchant: Boolean(body.merchant_id),
      hasCreditor: Boolean(paymentInformation.creditorAccountNumber),
      hasDebtor: Boolean(paymentInformation.debtorAccountNumber),
      debtorType: debtor.accountType,
      amount: body.amount,
    })
    return NextResponse.json(
      {
        error: created.error || 'יצירת העברה ב־Financy נכשלה',
        code: 'FINANCY_PAYMENT_FAILED',
      },
      { status: 502 }
    )
  }

  const paymentId = created.data.id
  const payUrl = created.data.payUrl || null
  const remoteStatus = mapRemoteStatus(created.data.status ?? undefined)
  const status = remoteStatus === 'created' && payUrl ? 'pending_bank' : remoteStatus

  const { data: row, error } = await admin
    .from('bank_transfers')
    .insert({
      client_id: auth.ctx.clientId,
      project_id: body.project_id ?? null,
      financy_payment_id: paymentId,
      external_id: externalId,
      amount: body.amount,
      currency: body.currency || 'ILS',
      description: body.description || null,
      payee_name: body.payee_name || null,
      payee_account: resolvedPayeeAccount || body.payee_account || null,
      status,
      pay_url: payUrl,
      raw: created.data as unknown as Record<string, unknown>,
    })
    .select(
      'id, project_id, financy_payment_id, external_id, amount, currency, description, payee_name, payee_account, status, pay_url, created_at'
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ transfer: row, pay_url: payUrl })
}

const refreshBodySchema = z.object({
  transfer_id: z.string().uuid(),
})

/** Poll Financy payment status into bank_transfers. */
export async function PATCH(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyTransfersEnabled()) {
    return NextResponse.json(
      { error: 'העברות כבויות בפלטפורמה', code: 'FINANCY_TRANSFERS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-transfer-refresh'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = refreshBodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok || !loaded.creds) {
    return NextResponse.json({ error: 'Financy לא מוגדר' }, { status: 400 })
  }

  const { data: existing, error: loadErr } = await admin
    .from('bank_transfers')
    .select('id, financy_payment_id, status, created_at')
    .eq('client_id', auth.ctx.clientId)
    .eq('id', validated.data.transfer_id)
    .maybeSingle()

  if (loadErr || !existing) {
    return NextResponse.json({ error: 'העברה לא נמצאה' }, { status: 404 })
  }

  const remote = await getPaymentStatus(loaded.creds, existing.financy_payment_id)
  if (!remote.ok) {
    return NextResponse.json({ error: remote.error }, { status: 502 })
  }

  let nextStatus = mapRemoteStatus(remote.data.status)
  // Abandon stale pending bank authorizations (TTL 48h) so UI does not stick forever.
  const PENDING_TTL_MS = 48 * 60 * 60 * 1000
  const createdAt = existing.created_at
    ? new Date(String(existing.created_at)).getTime()
    : 0
  if (
    (nextStatus === 'pending_bank' || nextStatus === 'created') &&
    createdAt > 0 &&
    Date.now() - createdAt > PENDING_TTL_MS
  ) {
    nextStatus = 'failed'
  }
  const { data: updated, error: updErr } = await admin
    .from('bank_transfers')
    .update({
      status: nextStatus,
      raw: remote.data as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .eq('client_id', auth.ctx.clientId)
    .select(
      'id, status, financy_payment_id, amount, currency, pay_url, updated_at'
    )
    .maybeSingle()

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({ transfer: updated, remote: remote.data })
}
