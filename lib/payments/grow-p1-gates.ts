/**
 * Grow P1 feature gates — all default OFF.
 *
 * Do not wire recurring / tokenization / refund / package picker / invoice share /
 * finance recon into production paths until Grow sandbox proof + owner approval.
 * See store docs: grow-p1-extension-requirements.md
 */

export type GrowP1Gate =
  | 'recurring'
  | 'tokenization'
  | 'refunds'
  | 'package_picker'
  | 'invoice_share'
  | 'finance_recon_ui'

const GATE_ENV: Record<GrowP1Gate, string> = {
  recurring: 'GROW_P1_RECURRING_ENABLED',
  tokenization: 'GROW_P1_TOKENIZATION_ENABLED',
  refunds: 'GROW_P1_REFUNDS_ENABLED',
  package_picker: 'GROW_P1_PACKAGE_PICKER_ENABLED',
  invoice_share: 'GROW_P1_INVOICE_SHARE_ENABLED',
  finance_recon_ui: 'GROW_P1_FINANCE_RECON_UI_ENABLED',
}

/** True only when env is exactly the string "true" (case-sensitive trim). */
export function isEnvFlagTrue(raw: string | null | undefined): boolean {
  return (raw || '').trim() === 'true'
}

export function isGrowP1GateEnabled(gate: GrowP1Gate): boolean {
  return isEnvFlagTrue(process.env[GATE_ENV[gate]])
}

export function isGrowP1RecurringEnabled(): boolean {
  return isGrowP1GateEnabled('recurring')
}

export function isGrowP1TokenizationEnabled(): boolean {
  return isGrowP1GateEnabled('tokenization')
}

export function isGrowP1RefundsEnabled(): boolean {
  return isGrowP1GateEnabled('refunds')
}

export function isGrowP1PackagePickerEnabled(): boolean {
  return isGrowP1GateEnabled('package_picker')
}

export function isGrowP1InvoiceShareEnabled(): boolean {
  return isGrowP1GateEnabled('invoice_share')
}

export function isGrowP1FinanceReconUiEnabled(): boolean {
  return isGrowP1GateEnabled('finance_recon_ui')
}

/** Snapshot for ops / diagnostics — never includes secrets. */
export function readGrowP1GatesStatus(): Record<GrowP1Gate, boolean> {
  return {
    recurring: isGrowP1RecurringEnabled(),
    tokenization: isGrowP1TokenizationEnabled(),
    refunds: isGrowP1RefundsEnabled(),
    package_picker: isGrowP1PackagePickerEnabled(),
    invoice_share: isGrowP1InvoiceShareEnabled(),
    finance_recon_ui: isGrowP1FinanceReconUiEnabled(),
  }
}
