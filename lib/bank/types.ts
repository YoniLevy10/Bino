/**
 * Financy / Open-Finance contracts for BINO bank OS.
 * Method names parallel MCP tools; product runtime uses REST.
 */

export type FinancyMoney = { amount: number; currency: string }

export type FinancyConnection = {
  id: string
  providerId?: string | null
  status?: string | null
  dataThrough?: string | null
  consentExpiresAt?: string | null
  [key: string]: unknown
}

export type FinancyAccount = {
  id: string
  connectionId?: string | null
  /** AIS account type — Financy uses accountType (CHECKING | CARD | …). */
  accountType?: string | null
  type?: string | null
  product?: string | null
  accountName?: string | null
  accountNumber?: string | null
  name?: string | null
  /** Legacy shape; live AIS uses balances[]. */
  balance?: FinancyMoney | number | null
  balances?: Array<{
    balanceType?: string
    balanceAmount?: { amount?: number | string; currency?: string }
    amount?: number | string
    currency?: string
    creditLimitIncluded?: boolean
  }>
  currency?: string | null
  status?: string | null
  creditStatus?: string | null
  [key: string]: unknown
}

export type FinancyTransaction = {
  id: string
  SK: string
  accountId?: string | null
  connectionId?: string | null
  providerId?: string | null
  merchantName?: string | null
  amount?: {
    chargedAmount?: FinancyMoney
    originalAmount?: FinancyMoney
  }
  description?: { description?: string; additionalInfo?: string }
  category?: { main?: string; sub?: string; categorizedBy?: string }
  changedCategory?: { main?: string; sub?: string; categorizedBy?: string }
  date?: {
    transactionDate?: string
    bookingDate?: string
    valueDate?: string
  }
  isDuplicate?: boolean
  [key: string]: unknown
}

export type FinancyIntegration = {
  id: string
  category?: 'invoicing' | 'clearing' | 'erp' | string
  provider?: string | null
  connectorId?: string | null
  connectorName?: string | null
  label?: string | null
  status?: string | null
  ready?: boolean
  [key: string]: unknown
}

export type FinancyPaymentCreateResult = {
  id: string
  payUrl?: string | null
  status?: string | null
}

export type FinancyPaymentStatus = {
  paymentId: string
  status: string
  [key: string]: unknown
}

export type FinancyDraftProposal = {
  id: string
  status?: string | null
  approvalUrl?: string | null
  [key: string]: unknown
}

/** Local DB row shapes (service-role writes). */
export type BankAccountRow = {
  id: string
  client_id: string
  project_id: string | null
  provider: 'financy'
  external_account_id: string
  connection_id: string | null
  account_type: string | null
  display_name: string | null
  currency: string
  balance: number | null
  raw: Record<string, unknown> | null
  synced_at: string
}

export type BankTransactionRow = {
  id: string
  client_id: string
  project_id: string | null
  bank_account_id: string | null
  external_id: string
  external_sk: string
  amount: number
  currency: string
  booked_at: string | null
  description: string | null
  merchant_name: string | null
  category_main: string | null
  category_sub: string | null
  match_status: 'unmatched' | 'matched_charge' | 'matched_expense' | 'ignored'
  matched_charge_id: string | null
  matched_expense_id: string | null
  raw: Record<string, unknown> | null
  synced_at: string
}

export type BankTransferStatus =
  | 'created'
  | 'pending_bank'
  | 'succeeded'
  | 'failed'
  | 'canceled'

export type BankTransferRow = {
  id: string
  client_id: string
  project_id: string | null
  financy_payment_id: string
  external_id: string
  amount: number
  currency: string
  description: string | null
  payee_name: string | null
  payee_account: string | null
  status: BankTransferStatus
  pay_url: string | null
  expense_id: string | null
  raw: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type BankPanelSection =
  | 'overview'
  | 'transactions'
  | 'transfers'
  | 'books'
  | 'clearing'
