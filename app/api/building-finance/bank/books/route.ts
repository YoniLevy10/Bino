import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { isBuildingFinancePlatformEnabled } from '@/lib/building-finance/platform-gate'
import { isFinancyBooksEnabled, isFinancyClearingEnabled } from '@/lib/bank/flags'
import { loadClientFinancyCredentials } from '@/lib/bank/financy-credentials'
import {
  draftReceipt,
  getReceivables,
  listClearingSettlements,
  listCardTransactions,
  listIntegrations,
  listInvoicingCustomers,
  listInvoicingDocuments,
  listProposals,
} from '@/lib/bank/financy-gateway'
import type { FinancyIntegration } from '@/lib/bank/types'
import { z } from 'zod'
import { formatZodError } from '@/lib/errors/format-zod-error'

export const dynamic = 'force-dynamic'

function integrationHaystack(i: FinancyIntegration): string {
  return [i.category, i.provider, i.connectorId, i.connectorName, i.id, i.label]
    .map((v) => String(v || '').toLowerCase())
    .join(' ')
}

function isClearingIntegration(i: FinancyIntegration): boolean {
  const cat = String(i.category || '').toLowerCase()
  if (cat === 'clearing') return true
  return /isracard|pelecard|clearing/.test(integrationHaystack(i))
}

function isIntegrationReady(i: FinancyIntegration): boolean {
  if (i.ready === true) return true
  const status = String(i.status || '').toLowerCase()
  return status === 'active' || status === 'connected' || status === 'ready'
}

function pickIntegration(
  items: FinancyIntegration[],
  prefer: 'invoicing' | 'clearing'
): FinancyIntegration | null {
  const ready = items.filter(isIntegrationReady)
  const pool = ready.length > 0 ? ready : items
  if (prefer === 'clearing') {
    // Never fall back to an invoicing/ERP id — settlements/card-tx on wrong connector stay empty.
    return pool.find(isClearingIntegration) || items.find(isClearingIntegration) || null
  }
  const byCat = pool.find((i) => String(i.category || '').toLowerCase() === prefer)
  if (byCat) return byCat
  return pool.find((i) => !isClearingIntegration(i)) || pool[0] || null
}

export async function GET(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBooksEnabled()) {
    return NextResponse.json(
      { error: 'ספרים כבויים בפלטפורמה', code: 'FINANCY_BOOKS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
  if (!loaded.enabled || !loaded.creds) {
    return NextResponse.json(
      { error: 'Financy לא מוגדר', code: 'FINANCY_NOT_CONFIGURED', integrations: [] },
      { status: 400 }
    )
  }

  const url = new URL(req.url)
  const requestedIntegrationId = url.searchParams.get('integration_id')
  const includeClearing = isFinancyClearingEnabled()

  const integrations = await listIntegrations(loaded.creds)
  // Soft-fail: surface connection/books UI even when integrations API is down.
  const items = integrations.ok ? integrations.data.items : []
  const integrationsError = integrations.ok ? null : integrations.error
  const requested = requestedIntegrationId
    ? items.find((i) => String(i.id) === requestedIntegrationId) || null
    : null
  // Books selector must not steal clearing (and vice versa).
  const booksPick =
    (requested && !isClearingIntegration(requested) ? requested : null) ||
    pickIntegration(items, 'invoicing')
  const clearingPick =
    (requested && isClearingIntegration(requested) ? requested : null) ||
    pickIntegration(items, 'clearing')

  const booksIntegrationId = booksPick ? String(booksPick.id) : null
  const clearingIntegrationId = clearingPick ? String(clearingPick.id) : null

  const receivables = await getReceivables(loaded.creds, {
    format: 'concise',
    customerLimit: 30,
  })

  const proposals = await listProposals(loaded.creds, { limit: 20 })

  let documents: Array<Record<string, unknown>> = []
  let documentsError: string | null = null
  let customers: Array<Record<string, unknown>> = []
  let customersError: string | null = null
  if (booksIntegrationId) {
    const [docs, custs] = await Promise.all([
      listInvoicingDocuments(loaded.creds, booksIntegrationId, { limit: 30 }),
      listInvoicingCustomers(loaded.creds, booksIntegrationId, { limit: 30 }),
    ])
    if (docs.ok) documents = docs.data.items
    else documentsError = docs.error
    if (custs.ok) customers = custs.data.items
    else customersError = custs.error
  }

  let settlements: Array<Record<string, unknown>> = []
  let cardTx: Array<Record<string, unknown>> = []
  let settlementsError: string | null = null
  let cardTxError: string | null = null
  if (includeClearing && clearingIntegrationId) {
    const [sett, cards] = await Promise.all([
      listClearingSettlements(loaded.creds, clearingIntegrationId, { limit: 20 }),
      listCardTransactions(loaded.creds, clearingIntegrationId, { limit: 20 }),
    ])
    if (sett.ok) settlements = sett.data.items
    else settlementsError = sett.error
    if (cards.ok) cardTx = cards.data.items
    else cardTxError = cards.error
  }

  return NextResponse.json({
    integrations: items,
    integrations_error: integrationsError,
    selected_integration_id: booksIntegrationId,
    clearing_integration_id: clearingIntegrationId,
    receivables: receivables.ok ? receivables.data : null,
    receivables_error: receivables.ok ? null : receivables.error,
    proposals: proposals.ok ? proposals.data.items : [],
    proposals_error: proposals.ok ? null : proposals.error,
    documents,
    documents_error: documentsError,
    customers,
    customers_error: customersError,
    clearing: includeClearing
      ? {
          settlements,
          card_transactions: cardTx,
          settlements_error: settlementsError,
          card_transactions_error: cardTxError,
          integration_id: clearingIntegrationId,
        }
      : null,
  })
}

const draftBodySchema = z.object({
  doctype: z.enum(['receipt', 'invoice', 'invrec', 'refund']).default('receipt'),
  client_name: z.string().max(200).optional(),
  amount: z.number().positive().optional(),
  description: z.string().max(500).optional(),
  integration_id: z.string().max(120).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

/** Create a Financy draft document — user approves in Financy (approvalUrl). */
export async function POST(req: Request) {
  if (!isBuildingFinancePlatformEnabled() || !isFinancyBooksEnabled()) {
    return NextResponse.json(
      { error: 'ספרים כבויים בפלטפורמה', code: 'FINANCY_BOOKS_DISABLED' },
      { status: 503 }
    )
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-books-draft'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const validated = draftBodySchema.safeParse(raw)
  if (!validated.success) {
    return NextResponse.json({ error: formatZodError(validated.error) }, { status: 400 })
  }

  const loaded = await loadClientFinancyCredentials(admin, auth.ctx.clientId)
  if (!loaded.ok || !loaded.creds) {
    return NextResponse.json({ error: 'Financy לא מוגדר' }, { status: 400 })
  }

  const body = validated.data
  const payload = {
    ...(body.payload || {}),
    integrationId: body.integration_id,
    clientName: body.client_name,
    items: body.amount
      ? [
          {
            desc: body.description || 'תשלום ועד / בניין',
            unitprice: body.amount,
            quantity: 1,
          },
        ]
      : undefined,
  }

  const drafted = await draftReceipt(loaded.creds, {
    ...payload,
    doctype: body.doctype,
  })
  if (!drafted.ok) {
    return NextResponse.json({ error: drafted.error }, { status: 502 })
  }

  return NextResponse.json({
    proposal: drafted.data,
    approval_url: drafted.data.approvalUrl || null,
  })
}
