/**
 * Map stored bank_accounts rows → UI fields.
 * Hydrates display_name / balance / account_type from Financy `raw` when
 * older syncs left those columns null (wrong field mapping).
 */

import {
  extractAccountCurrency,
  extractAccountDisplayName,
  extractAccountType,
  extractBalanceAmount,
  isFinancyAccountDeleted,
} from '@/lib/bank/financy-gateway'
import type { FinancyAccount } from '@/lib/bank/types'

export type BankAccountApiRow = {
  id: string
  project_id: string | null
  external_account_id: string
  connection_id: string | null
  account_type: string | null
  display_name: string | null
  currency: string
  balance: number | null
  synced_at: string
  raw?: Record<string, unknown> | null
}

export function hydrateBankAccountRow(row: BankAccountApiRow): BankAccountApiRow | null {
  const raw = (row.raw || null) as FinancyAccount | null
  if (raw && isFinancyAccountDeleted(raw)) return null

  const needsName = !row.display_name
  const needsBalance = row.balance == null
  const needsType = !row.account_type

  if (!raw || (!needsName && !needsBalance && !needsType)) {
    const { raw: _drop, ...rest } = row
    return rest
  }

  const { raw: _drop, ...rest } = row
  return {
    ...rest,
    display_name: row.display_name || extractAccountDisplayName(raw),
    balance: row.balance != null ? row.balance : extractBalanceAmount(raw),
    account_type: row.account_type || extractAccountType(raw),
    currency: row.currency || extractAccountCurrency(raw),
  }
}
