'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { evaluateOptimizationRules } from '@/lib/mbrain/optimization-rules'

type Dash = {
  meta: { label: string }
  kpis: {
    spend: number | null
    leads: number | null
    cpl: number | null
    ctr: number | null
    cpc: number | null
    conversionRate: number | null
    noteHe: string
  }
}

export default function PerformancePage() {
  const [data, setData] = useState<Dash | null>(null)
  const [rules, setRules] = useState<ReturnType<typeof evaluateOptimizationRules>>([])

  useEffect(() => {
    void (async () => {
      const res = await fetchWithTimeout('/api/mbrain/dashboard')
      if (!res.ok) return
      const j = (await res.json()) as Dash
      setData(j)
      const spend = j.kpis.spend ?? 0
      const leads = j.kpis.leads ?? 0
      setRules(
        evaluateOptimizationRules({
          spend,
          leads,
          clicks: 0,
          impressions: 0,
          ctr: j.kpis.ctr,
          frequency: null,
          targetCpl: 150,
          minSpend: 50,
          minLeads: 3,
          cplMultiplier: 1.5,
        })
      )
    })()
  }, [])

  return (
    <BrainShell metaLabel={data?.meta.label}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">ביצועים</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            מדדים מ-performance_snapshots בלבד. {data?.kpis.noteHe}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            ['הוצאה', data?.kpis.spend],
            ['לידים', data?.kpis.leads],
            ['CPL', data?.kpis.cpl],
            ['CTR', data?.kpis.ctr],
            ['CPC', data?.kpis.cpc],
            ['המרה', data?.kpis.conversionRate],
          ].map(([label, value]) => (
            <div key={String(label)} className="mbrain-card p-4">
              <div className="text-2xl font-semibold text-white">{value ?? '—'}</div>
              <div className="text-xs text-[var(--mbrain-muted)]">{label}</div>
            </div>
          ))}
        </div>
        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">כללי אופטימיזציה (דטרמיניסטיים)</h3>
          <ul className="mt-3 space-y-3">
            {rules.map((r) => (
              <li key={r.ruleCode} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                <p className="text-sm text-white">
                  [{r.severity}] {r.title}
                </p>
                <p className="text-xs text-[var(--mbrain-muted)]">{r.explanation}</p>
                <p className="text-xs text-[var(--mbrain-accent)]">{r.proposedAction}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </BrainShell>
  )
}
