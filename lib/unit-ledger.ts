/**
 * Unit ledger (כרטסת דירה) — charges / payments / credits with running balance.
 * All writes go through getSupabaseAdmin() from API routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CollectionChargeRow } from '@/lib/collection-charges'

export const LEDGER_ENTRY_TYPES = ['charge', 'payment', 'credit', 'reversal'] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]

export const LEDGER_PAYMENT_METHODS = [
  'grow',
  'cash',
  'transfer',
  'check',
  'other',
  'synced',
] as const
export type LedgerPaymentMethod = (typeof LEDGER_PAYMENT_METHODS)[number]

export type UnitLedgerEntryRow = {
  id: string
  client_id: string
  project_id: string
  unit_id: string | null
  resident_id: string | null
  entry_type: LedgerEntryType
  amount: number
  signed_amount: number
  currency: string
  charge_id: string | null
  period_label: string | null
  description: string | null
  payment_method: LedgerPaymentMethod | null
  receipt_note: string | null
  idempotency_key: string
  created_by: string | null
  created_at: string
}

export const UNIT_LEDGER_ENTRY_SELECT = `
  id, client_id, project_id, unit_id, resident_id, entry_type, amount, signed_amount,
  currency, charge_id, period_label, description, payment_method, receipt_note,
  idempotency_key, created_by, created_at
`.replace(/\s+/g, ' ').trim()

/** Charge increases debt (+); payment/credit/reversal decrease debt (-). */
export function signedAmountForEntryType(
  entryType: LedgerEntryType,
  amount: number
): number {
  const abs = Math.round(Number(amount) * 100) / 100
  if (!(abs > 0)) throw new Error('ledger_amount_must_be_positive')
  if (entryType === 'charge') return abs
  return -abs
}

export function roundMoney(n: number): number {
  return Math.round(Number(n) * 100) / 100
}

/** Running balance after each entry (oldest → newest). Positive = debt. */
export function computeRunningBalances<T extends { signed_amount: number }>(
  entriesOldestFirst: T[]
): Array<T & { running_balance: number }> {
  let bal = 0
  return entriesOldestFirst.map((e) => {
    bal = roundMoney(bal + Number(e.signed_amount))
    return { ...e, running_balance: bal }
  })
}

export function sumSignedAmounts(entries: { signed_amount: number }[]): number {
  return roundMoney(entries.reduce((s, e) => s + Number(e.signed_amount), 0))
}

/** Sum of payment/credit amounts applied to a charge (positive number). */
export function sumPaymentsTowardCharge(
  entries: { entry_type: string; amount: number; charge_id?: string | null }[],
  chargeId: string
): number {
  return roundMoney(
    entries
      .filter(
        (e) =>
          e.charge_id === chargeId &&
          (e.entry_type === 'payment' || e.entry_type === 'credit')
      )
      .reduce((s, e) => s + Number(e.amount), 0)
  )
}

export function chargeRemaining(chargeAmount: number, paidToward: number): number {
  return roundMoney(Math.max(0, Number(chargeAmount) - Number(paidToward)))
}

export function shouldMarkChargePaid(chargeAmount: number, paidToward: number): boolean {
  return chargeRemaining(chargeAmount, paidToward) <= 0
}

export function ledgerIdempotencyKey(
  kind: 'charge' | 'grow_paid' | 'manual_paid' | 'partial' | 'credit' | 'reversal' | 'synced_paid',
  ...parts: string[]
): string {
  return [kind, ...parts.map((p) => String(p).trim())].filter(Boolean).join(':').slice(0, 200)
}

export function isLedgerPaymentMethod(v: unknown): v is LedgerPaymentMethod {
  return typeof v === 'string' && (LEDGER_PAYMENT_METHODS as readonly string[]).includes(v)
}

type PostEntryInput = {
  clientId: string
  projectId: string
  unitId?: string | null
  residentId?: string | null
  entryType: LedgerEntryType
  amount: number
  chargeId?: string | null
  periodLabel?: string | null
  description?: string | null
  paymentMethod?: LedgerPaymentMethod | null
  receiptNote?: string | null
  idempotencyKey: string
  createdBy?: string | null
  createdAt?: string | null
}

export type PostLedgerResult =
  | { ok: true; entry: UnitLedgerEntryRow; replay: boolean }
  | { ok: false; error: string }

async function fetchByIdempotency(
  admin: SupabaseClient,
  clientId: string,
  key: string
): Promise<UnitLedgerEntryRow | null> {
  const { data } = await admin
    .from('unit_ledger_entries')
    .select(UNIT_LEDGER_ENTRY_SELECT)
    .eq('client_id', clientId)
    .eq('idempotency_key', key)
    .maybeSingle()
  return (data as unknown as UnitLedgerEntryRow | null) ?? null
}

export async function postLedgerEntry(
  admin: SupabaseClient,
  input: PostEntryInput
): Promise<PostLedgerResult> {
  const existing = await fetchByIdempotency(admin, input.clientId, input.idempotencyKey)
  if (existing) return { ok: true, entry: existing, replay: true }

  if (!input.unitId && !input.residentId) {
    return { ok: false, error: 'נדרש unit_id או resident_id לכרטסת' }
  }

  let signed: number
  try {
    signed = signedAmountForEntryType(input.entryType, input.amount)
  } catch {
    return { ok: false, error: 'סכום לא תקין' }
  }

  const row = {
    client_id: input.clientId,
    project_id: input.projectId,
    unit_id: input.unitId || null,
    resident_id: input.residentId || null,
    entry_type: input.entryType,
    amount: roundMoney(input.amount),
    signed_amount: signed,
    currency: 'ILS',
    charge_id: input.chargeId || null,
    period_label: input.periodLabel?.trim() || null,
    description: input.description?.trim() || null,
    payment_method: input.paymentMethod || null,
    receipt_note: input.receiptNote?.trim() || null,
    idempotency_key: input.idempotencyKey,
    created_by: input.createdBy || null,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  }

  const { data, error } = await admin
    .from('unit_ledger_entries')
    .insert(row)
    .select(UNIT_LEDGER_ENTRY_SELECT)
    .single()

  if (error?.code === '23505') {
    const again = await fetchByIdempotency(admin, input.clientId, input.idempotencyKey)
    if (again) return { ok: true, entry: again, replay: true }
  }
  if (error || !data) {
    return { ok: false, error: error?.message || 'שמירת תנועת כרטסת נכשלה' }
  }
  return { ok: true, entry: data as unknown as UnitLedgerEntryRow, replay: false }
}

export type ChargeAnchor = {
  id: string
  client_id: string
  project_id: string | null
  resident_id: string | null
  unit_id?: string | null
  title: string
  amount: number
  period_label?: string | null
  status: string
  paid_at?: string | null
  created_at?: string
}

async function resolveUnitIdForCharge(
  admin: SupabaseClient,
  charge: ChargeAnchor
): Promise<string | null> {
  if (charge.unit_id) return charge.unit_id
  if (!charge.resident_id) return null
  const { data } = await admin
    .from('residents')
    .select('unit_id')
    .eq('id', charge.resident_id)
    .eq('client_id', charge.client_id)
    .maybeSingle()
  return (data?.unit_id as string | null) || null
}

/** Idempotent charge line: `charge:{chargeId}`. */
export async function ensureLedgerChargeEntry(
  admin: SupabaseClient,
  charge: ChargeAnchor,
  opts?: { createdBy?: string | null }
): Promise<PostLedgerResult> {
  if (!charge.project_id) {
    return { ok: false, error: 'לחיוב חסר project_id — לא ניתן לרשום בכרטסת' }
  }
  if (charge.status === 'cancelled') {
    const existing = await fetchByIdempotency(
      admin,
      charge.client_id,
      ledgerIdempotencyKey('charge', charge.id)
    )
    if (existing) return { ok: true, entry: existing, replay: true }
    return { ok: false, error: 'לא רושמים חיוב מבוטל בכרטסת' }
  }
  const unitId = await resolveUnitIdForCharge(admin, charge)
  return postLedgerEntry(admin, {
    clientId: charge.client_id,
    projectId: charge.project_id,
    unitId,
    residentId: charge.resident_id,
    entryType: 'charge',
    amount: Number(charge.amount),
    chargeId: charge.id,
    periodLabel: charge.period_label,
    description: charge.title,
    idempotencyKey: ledgerIdempotencyKey('charge', charge.id),
    createdBy: opts?.createdBy ?? null,
    createdAt: charge.created_at || null,
  })
}

async function paidTowardCharge(
  admin: SupabaseClient,
  clientId: string,
  chargeId: string
): Promise<number> {
  const { data, error } = await admin
    .from('unit_ledger_entries')
    .select('entry_type, amount, charge_id')
    .eq('client_id', clientId)
    .eq('charge_id', chargeId)
    .in('entry_type', ['payment', 'credit'])
  if (error) throw new Error(`ledger_paid_toward_failed: ${error.message}`)
  return sumPaymentsTowardCharge(
    (data ?? []) as { entry_type: string; amount: number; charge_id: string | null }[],
    chargeId
  )
}

export type PostPaymentOpts = {
  charge: ChargeAnchor
  amount: number
  idempotencyKey: string
  paymentMethod?: LedgerPaymentMethod | null
  receiptNote?: string | null
  description?: string | null
  createdBy?: string | null
  /** When true, do not exceed remaining balance on the charge. */
  clampToRemaining?: boolean
}

/**
 * Post a payment (or credit-toward-charge) against a charge.
 * Idempotent on idempotencyKey. Ensures the charge line exists first.
 */
export async function postLedgerPaymentForCharge(
  admin: SupabaseClient,
  opts: PostPaymentOpts
): Promise<
  | {
      ok: true
      entry: UnitLedgerEntryRow
      replay: boolean
      remaining: number
      paidToward: number
      fullyPaid: boolean
    }
  | { ok: false; error: string }
> {
  const charge = opts.charge
  if (!charge.project_id) return { ok: false, error: 'לחיוב חסר project_id' }

  const ensured = await ensureLedgerChargeEntry(admin, charge, { createdBy: opts.createdBy })
  if (!ensured.ok) return ensured

  const already = await paidTowardCharge(admin, charge.client_id, charge.id)
  let payAmount = roundMoney(opts.amount)
  if (!(payAmount > 0)) return { ok: false, error: 'סכום תשלום חייב להיות חיובי' }

  const remainingBefore = chargeRemaining(Number(charge.amount), already)
  if (remainingBefore <= 0) {
    const existing = await fetchByIdempotency(admin, charge.client_id, opts.idempotencyKey)
    if (existing) {
      return {
        ok: true,
        entry: existing,
        replay: true,
        remaining: 0,
        paidToward: already,
        fullyPaid: true,
      }
    }
    return { ok: false, error: 'החיוב כבר שולם במלואו בכרטסת' }
  }

  if (opts.clampToRemaining !== false && payAmount > remainingBefore) {
    payAmount = remainingBefore
  }

  const unitId = await resolveUnitIdForCharge(admin, charge)
  const posted = await postLedgerEntry(admin, {
    clientId: charge.client_id,
    projectId: charge.project_id,
    unitId,
    residentId: charge.resident_id,
    entryType: 'payment',
    amount: payAmount,
    chargeId: charge.id,
    periodLabel: charge.period_label,
    description: opts.description || `תשלום — ${charge.title}`,
    paymentMethod: opts.paymentMethod ?? null,
    receiptNote: opts.receiptNote ?? null,
    idempotencyKey: opts.idempotencyKey,
    createdBy: opts.createdBy ?? null,
  })
  if (!posted.ok) return posted

  const paidToward = posted.replay
    ? already
    : roundMoney(already + payAmount)
  // On replay, re-read paid toward for accuracy
  const paidTowardFinal = posted.replay
    ? await paidTowardCharge(admin, charge.client_id, charge.id)
    : paidToward
  const remaining = chargeRemaining(Number(charge.amount), paidTowardFinal)
  return {
    ok: true,
    entry: posted.entry,
    replay: posted.replay,
    remaining,
    paidToward: paidTowardFinal,
    fullyPaid: remaining <= 0,
  }
}

/** Grow / mark-paid: pay remaining balance once (idempotent keys). */
export async function postLedgerFullPaymentForCharge(
  admin: SupabaseClient,
  opts: {
    charge: ChargeAnchor
    source: 'grow' | 'manual'
    createdBy?: string | null
    receiptNote?: string | null
  }
): Promise<
  | { ok: true; entry: UnitLedgerEntryRow | null; replay: boolean; fullyPaid: boolean }
  | { ok: false; error: string }
> {
  const key =
    opts.source === 'grow'
      ? ledgerIdempotencyKey('grow_paid', opts.charge.id)
      : ledgerIdempotencyKey('manual_paid', opts.charge.id)

  const already = await paidTowardCharge(admin, opts.charge.client_id, opts.charge.id)
  const remaining = chargeRemaining(Number(opts.charge.amount), already)
  if (remaining <= 0) {
    const existing = await fetchByIdempotency(admin, opts.charge.client_id, key)
    return { ok: true, entry: existing, replay: true, fullyPaid: true }
  }

  const result = await postLedgerPaymentForCharge(admin, {
    charge: opts.charge,
    amount: remaining,
    idempotencyKey: key,
    paymentMethod: opts.source === 'grow' ? 'grow' : 'other',
    receiptNote: opts.receiptNote ?? null,
    description:
      opts.source === 'grow'
        ? `תשלום Grow — ${opts.charge.title}`
        : `תשלום ידני — ${opts.charge.title}`,
    createdBy: opts.createdBy ?? null,
    clampToRemaining: true,
  })
  if (!result.ok) return result
  return {
    ok: true,
    entry: result.entry,
    replay: result.replay,
    fullyPaid: result.fullyPaid,
  }
}

export async function postLedgerCredit(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    unitId?: string | null
    residentId?: string | null
    amount: number
    description?: string | null
    receiptNote?: string | null
    idempotencyKey: string
    createdBy?: string | null
  }
): Promise<PostLedgerResult> {
  return postLedgerEntry(admin, {
    clientId: opts.clientId,
    projectId: opts.projectId,
    unitId: opts.unitId,
    residentId: opts.residentId,
    entryType: 'credit',
    amount: opts.amount,
    description: opts.description || 'יתרת זכות',
    paymentMethod: 'other',
    receiptNote: opts.receiptNote,
    idempotencyKey: opts.idempotencyKey,
    createdBy: opts.createdBy,
  })
}

export async function listLedgerEntriesForUnit(
  admin: SupabaseClient,
  opts: {
    clientId: string
    unitId?: string | null
    residentId?: string | null
    projectId?: string | null
    limit?: number
  }
): Promise<{ entries: UnitLedgerEntryRow[]; balance: number }> {
  if (!opts.unitId && !opts.residentId) {
    return { entries: [], balance: 0 }
  }
  const limit = Math.min(500, Math.max(1, opts.limit ?? 200))
  let query = admin
    .from('unit_ledger_entries')
    .select(UNIT_LEDGER_ENTRY_SELECT)
    .eq('client_id', opts.clientId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (opts.unitId) {
    query = query.eq('unit_id', opts.unitId)
  } else if (opts.residentId) {
    query = query.eq('resident_id', opts.residentId)
  }
  if (opts.projectId) query = query.eq('project_id', opts.projectId)

  const { data, error } = await query
  if (error) throw new Error(`ledger_list_failed: ${error.message}`)
  const entries = (data ?? []) as unknown as UnitLedgerEntryRow[]
  return { entries, balance: sumSignedAmounts(entries) }
}

/**
 * Best-effort: ensure ledger lines exist for charges of this unit/resident
 * (idempotent). Historical paid charges get a synced payment line.
 */
export async function syncChargesIntoLedger(
  admin: SupabaseClient,
  opts: {
    clientId: string
    unitId?: string | null
    residentId?: string | null
    projectId?: string | null
  }
): Promise<{ syncedCharges: number; syncedPayments: number }> {
  if (!opts.unitId && !opts.residentId) {
    return { syncedCharges: 0, syncedPayments: 0 }
  }

  const selectCols =
    'id, client_id, project_id, resident_id, unit_id, title, amount, period_label, status, paid_at, created_at'
  const seen = new Map<string, ChargeAnchor>()

  const load = async (filter: { column: string; value: string }) => {
    let query = admin
      .from('collection_charges')
      .select(selectCols)
      .eq('client_id', opts.clientId)
      .eq(filter.column, filter.value)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(200)
    if (opts.projectId) query = query.eq('project_id', opts.projectId)
    const { data, error } = await query
    if (error) throw new Error(`ledger_sync_charges_failed: ${error.message}`)
    for (const raw of data ?? []) {
      const charge = raw as ChargeAnchor
      seen.set(charge.id, charge)
    }
  }

  // Include both unit-linked charges and resident-linked (many rows lack unit_id).
  if (opts.unitId) await load({ column: 'unit_id', value: opts.unitId })
  if (opts.residentId) await load({ column: 'resident_id', value: opts.residentId })

  let syncedCharges = 0
  let syncedPayments = 0
  for (const charge of seen.values()) {
    const ensured = await ensureLedgerChargeEntry(admin, charge)
    if (ensured.ok && !ensured.replay) syncedCharges += 1
    if (charge.status === 'paid') {
      const syncPay = await postLedgerPaymentForCharge(admin, {
        charge,
        amount: Number(charge.amount),
        idempotencyKey: ledgerIdempotencyKey('synced_paid', charge.id),
        paymentMethod: 'synced',
        description: `סנכרון שולם — ${charge.title}`,
        receiptNote: 'סנכרון מחיוב קיים',
        clampToRemaining: true,
      })
      if (syncPay.ok && !syncPay.replay) syncedPayments += 1
    }
  }
  return { syncedCharges, syncedPayments }
}

export function chargeAnchorFromRow(row: CollectionChargeRow): ChargeAnchor {
  return {
    id: row.id,
    client_id: row.client_id,
    project_id: row.project_id,
    resident_id: row.resident_id,
    unit_id: row.unit_id ?? null,
    title: row.title,
    amount: Number(row.amount),
    period_label: row.period_label,
    status: row.status,
    paid_at: row.paid_at,
    created_at: row.created_at,
  }
}
