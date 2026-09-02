import { describe, expect, it } from 'vitest'
import { evaluateOptimizationRules } from '@/lib/mbrain/optimization-rules'
import { rollupKpis } from '@/lib/mbrain/meta/insights'

describe('optimization rules + kpi rollup', () => {
  it('does not judge before minimum spend', () => {
    const hits = evaluateOptimizationRules({
      spend: 10,
      leads: 0,
      clicks: 5,
      impressions: 100,
      ctr: 5,
      frequency: 1,
      targetCpl: 150,
      minSpend: 50,
      minLeads: 3,
      cplMultiplier: 1.5,
    })
    expect(hits).toHaveLength(1)
    expect(hits[0]?.ruleCode).toBe('INSUFFICIENT_DATA')
  })

  it('flags spend with zero leads after threshold', () => {
    const hits = evaluateOptimizationRules({
      spend: 80,
      leads: 0,
      clicks: 20,
      impressions: 3000,
      ctr: 0.6,
      frequency: 1.2,
      targetCpl: 150,
      minSpend: 50,
      minLeads: 3,
      cplMultiplier: 1.5,
    })
    expect(hits.some((h) => h.ruleCode === 'SPEND_NO_LEADS')).toBe(true)
  })

  it('computes CPL/CTR in code not via LLM', () => {
    const k = rollupKpis([
      { spend: 100, leads: 2, impressions: 1000, clicks: 50 },
      { spend: 50, leads: 1, impressions: 500, clicks: 25 },
    ])
    expect(k.spend).toBe(150)
    expect(k.leads).toBe(3)
    expect(k.cpl).toBe(50)
    expect(k.ctr).toBeCloseTo(5, 5)
  })
})
