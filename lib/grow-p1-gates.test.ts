import { afterEach, describe, expect, it } from 'vitest'
import {
  isEnvFlagTrue,
  isGrowP1FinanceReconUiEnabled,
  isGrowP1InvoiceShareEnabled,
  isGrowP1PackagePickerEnabled,
  isGrowP1RecurringEnabled,
  isGrowP1RefundsEnabled,
  isGrowP1TokenizationEnabled,
  readGrowP1GatesStatus,
} from '@/lib/grow-p1-gates'

const GATE_KEYS = [
  'GROW_P1_RECURRING_ENABLED',
  'GROW_P1_TOKENIZATION_ENABLED',
  'GROW_P1_REFUNDS_ENABLED',
  'GROW_P1_PACKAGE_PICKER_ENABLED',
  'GROW_P1_INVOICE_SHARE_ENABLED',
  'GROW_P1_FINANCE_RECON_UI_ENABLED',
] as const

const saved: Partial<Record<(typeof GATE_KEYS)[number], string | undefined>> = {}

afterEach(() => {
  for (const key of GATE_KEYS) {
    if (key in saved) {
      const v = saved[key]
      if (v === undefined) delete process.env[key]
      else process.env[key] = v
      delete saved[key]
    } else {
      delete process.env[key]
    }
  }
})

function setGate(key: (typeof GATE_KEYS)[number], value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

describe('isEnvFlagTrue', () => {
  it('accepts only exact "true"', () => {
    expect(isEnvFlagTrue('true')).toBe(true)
    expect(isEnvFlagTrue(' true ')).toBe(true)
    expect(isEnvFlagTrue('True')).toBe(false)
    expect(isEnvFlagTrue('1')).toBe(false)
    expect(isEnvFlagTrue('yes')).toBe(false)
    expect(isEnvFlagTrue('')).toBe(false)
    expect(isEnvFlagTrue(undefined)).toBe(false)
  })
})

describe('Grow P1 gates default OFF', () => {
  it('all gates false when env unset', () => {
    for (const key of GATE_KEYS) setGate(key, undefined)
    expect(isGrowP1RecurringEnabled()).toBe(false)
    expect(isGrowP1TokenizationEnabled()).toBe(false)
    expect(isGrowP1RefundsEnabled()).toBe(false)
    expect(isGrowP1PackagePickerEnabled()).toBe(false)
    expect(isGrowP1InvoiceShareEnabled()).toBe(false)
    expect(isGrowP1FinanceReconUiEnabled()).toBe(false)
    expect(readGrowP1GatesStatus()).toEqual({
      recurring: false,
      tokenization: false,
      refunds: false,
      package_picker: false,
      invoice_share: false,
      finance_recon_ui: false,
    })
  })

  it('does not treat 1 / TRUE as enabled', () => {
    setGate('GROW_P1_RECURRING_ENABLED', '1')
    setGate('GROW_P1_REFUNDS_ENABLED', 'TRUE')
    expect(isGrowP1RecurringEnabled()).toBe(false)
    expect(isGrowP1RefundsEnabled()).toBe(false)
  })

  it('enables only when env is true', () => {
    setGate('GROW_P1_TOKENIZATION_ENABLED', 'true')
    expect(isGrowP1TokenizationEnabled()).toBe(true)
    expect(isGrowP1RecurringEnabled()).toBe(false)
  })
})
