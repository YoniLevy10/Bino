'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { evaluateOptimizationRules } from '@/lib/mbrain/optimization-rules'

type Digest = {
  label: string
  summaryHe: string
  recommendations: Array<{
    id: string
    rule_code: string
    severity: string
    title: string
    explanation: string
    proposed_action: string
    requires_approval: boolean
  }>
  nextStepsHe: string[]
}

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
  const [digest, setDigest] = useState<Digest | null>(null)
  const [rules, setRules] = useState<ReturnType<typeof evaluateOptimizationRules>>([])

  useEffect(() => {
    void (async () => {
      const [dashRes, digRes] = await Promise.all([
        fetchWithTimeout('/api/mbrain/dashboard'),
        fetchWithTimeout('/api/mbrain/digest'),
      ])
      if (dashRes.ok) {
        const j = (await dashRes.json()) as Dash
        setData(j)
        setRules(
          evaluateOptimizationRules({
            spend: j.kpis.spend ?? 0,
            leads: j.kpis.leads ?? 0,
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
      }
      if (digRes.ok) setDigest((await digRes.json()) as Digest)
    })()
  }, [])

  return (
    <BrainShell metaLabel={digest?.label ?? data?.meta.label}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">ביצועים</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            כמו מנהל קמפיינים: מה קרה, ומה לעשות עכשיו. {data?.kpis.noteHe}
          </p>
        </div>

        {digest ? (
          <section className="mbrain-card space-y-3 p-5">
            <h3 className="text-lg text-white">סיכום יומי</h3>
            <p className="text-sm text-[var(--mbrain-ink)]">{digest.summaryHe}</p>
            <ul className="list-disc pr-5 text-xs text-[var(--mbrain-muted)]">
              {digest.nextStepsHe.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        ) : null}

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
          <h3 className="text-lg text-white">המלצות פתוחות</h3>
          {(digest?.recommendations?.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-[var(--mbrain-muted)]">אין המלצות שמורות — יופיעו אחרי סנכרון Insights.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {digest!.recommendations.map((r) => (
                <li key={r.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                  <p className="text-sm text-white">
                    [{r.severity}] {r.title}
                  </p>
                  <p className="text-xs text-[var(--mbrain-muted)]">{r.explanation}</p>
                  <p className="text-xs text-[var(--mbrain-accent)]">{r.proposed_action}</p>
                  {r.requires_approval ? (
                    <Link href="/brain/approvals" className="mt-1 inline-block text-xs text-[var(--mbrain-accent)]">
                      לאישור →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">כללים חיים (דטרמיניסטיים)</h3>
          <ul className="mt-3 space-y-3">
            {rules.map((r) => (
              <li key={r.ruleCode} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                <p className="text-sm text-white">
                  [{r.severity}] {r.title}
                </p>
                <p className="text-xs text-[var(--mbrain-muted)]">{r.explanation}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </BrainShell>
  )
}
