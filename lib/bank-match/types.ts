export type BankTxSource = 'csv' | 'scraper' | 'financy' | 'manual'
export type BankTxDirection = 'credit' | 'debit'

export type NormalizedBankTransaction = {
  project_id: string
  booked_at: string | null
  amount: number
  currency: string
  direction: BankTxDirection
  description: string | null
  reference: string | null
  counterparty: string | null
  external_sk: string
  source: BankTxSource
}

export type MatchConfidence = 'A' | 'B' | 'C' | 'manual'

export type MatchCandidateCharge = {
  id: string
  amount: number
  status: string
  payment_reference: string | null
  period_label: string | null
  resident_id: string | null
  apartment_number: string | null
  resident_name: string | null
  bank_transaction_id: string | null
  paid_at: string | null
}

export type MatchDecision =
  | {
      kind: 'auto'
      chargeId: string
      confidence: 'A' | 'B'
      reason: string
    }
  | {
      kind: 'suggested'
      chargeId: string
      confidence: 'C'
      reason: string
    }
  | {
      kind: 'none'
      reason: string
    }
