/**
 * Collections bridge: use Financy receivables / drafts for Vaad collection insights.
 * Does not replace Grow mark-paid webhooks for legacy charges.
 */

import type { FinancyCredentials } from '@/lib/bank/financy-auth'
import { draftReceipt, getReceivables } from '@/lib/bank/financy-gateway'

export async function loadFinancyReceivablesForCollections(
  creds: FinancyCredentials
): Promise<
  | { ok: true; receivables: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const res = await getReceivables(creds, {
    format: 'detailed',
    customerLimit: 50,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, receivables: res.data }
}

export async function draftCollectionReceiptViaFinancy(params: {
  creds: FinancyCredentials
  residentName: string
  amount: number
  description?: string
}): Promise<
  | { ok: true; approvalUrl: string | null; proposal: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const drafted = await draftReceipt(params.creds, {
    clientName: params.residentName,
    items: [
      {
        desc: params.description || 'גביית ועד',
        unitprice: params.amount,
        quantity: 1,
      },
    ],
  })
  if (!drafted.ok) return { ok: false, error: drafted.error }
  return {
    ok: true,
    approvalUrl: drafted.data.approvalUrl || null,
    proposal: drafted.data as Record<string, unknown>,
  }
}
