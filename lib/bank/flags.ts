/**
 * Feature flags for Financy bank OS.
 * Platform kill-switches via env; defaults keep AIS/UI on when building finance is on,
 * transfers/books/clearing opt-in until piloted.
 */

function envFlag(name: string, defaultOn: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultOn
  return raw !== '0' && raw.toLowerCase() !== 'false'
}

/** Master: Financy bank sync + gateway reads. */
export function isFinancyBankSyncEnabled(): boolean {
  return envFlag('FINANCY_BANK_SYNC', true)
}

/** PIS transfers UI + APIs. */
export function isFinancyTransfersEnabled(): boolean {
  return envFlag('FINANCY_TRANSFERS', true)
}

/** Invoicing / ERP / receivables via Financy integrations. */
export function isFinancyBooksEnabled(): boolean {
  return envFlag('FINANCY_BOOKS', true)
}

/** Isracard / Pelecard clearing surfaces. */
export function isFinancyClearingEnabled(): boolean {
  return envFlag('FINANCY_CLEARING', true)
}

/** Hub tab + /finance/bank shell. */
export function isFinancyBankUiEnabled(): boolean {
  return envFlag('FINANCY_BANK_UI', true)
}

export type FinancyFlagSnapshot = {
  bank_sync: boolean
  transfers: boolean
  books: boolean
  clearing: boolean
  bank_ui: boolean
}

export function getFinancyFlagSnapshot(): FinancyFlagSnapshot {
  return {
    bank_sync: isFinancyBankSyncEnabled(),
    transfers: isFinancyTransfersEnabled(),
    books: isFinancyBooksEnabled(),
    clearing: isFinancyClearingEnabled(),
    bank_ui: isFinancyBankUiEnabled(),
  }
}
