'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'
import type { CampaignPlan } from '@/lib/mbrain/strategy-schema'

type Objective = {
  id: string
  title: string
  daily_budget: number | null
  max_cpl: number | null
  total_budget: number | null
  status: string
  brand_id: string
}

type Strategy = {
  id: string
  objective_id: string
  version: number
  status: string
  plan: CampaignPlan
  model_provider: string | null
  generation_cost_usd: number
}

export default function StrategyPage() {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Strategy | null>(null)

  async function refresh() {
    const [oRes, sRes] = await Promise.all([
      fetchWithTimeout('/api/mbrain/objectives?brandId=' + BAMAKOR_BRAND_ID),
      fetchWithTimeout('/api/mbrain/strategies'),
    ])
    if (oRes.ok) {
      const j = (await oRes.json()) as { objectives: Objective[] }
      setObjectives(j.objectives)
    }
    if (sRes.ok) {
      const j = (await sRes.json()) as { strategies: Strategy[] }
      setStrategies(j.strategies)
      if (j.strategies[0]) setSelected(j.strategies[0])
    }
  }

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function createDefaultObjective() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/objectives',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: BAMAKOR_BRAND_ID,
            title: 'Generate qualified leads from Israeli property management companies',
            goalType: 'qualified_leads',
            targetCount: 20,
            maxCpl: 150,
            totalBudget: 3000,
            dailyBudget: 100,
            market: 'IL',
            audience: 'Property management companies',
            productName: 'Bamakor',
            rawBrief:
              'Generate qualified leads from Israeli property management companies. Budget ₪100/day. Target CPL ≤ ₪150.',
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { error?: string; objective?: Objective; violations?: unknown }
      if (!res.ok) throw new Error(j.error || 'יצירת יעד נכשלה')
      await refresh()
      if (j.objective) await generateFor(j.objective.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function generateFor(objectiveId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/strategies/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectiveId }),
        },
        120_000
      )
      const j = (await res.json()) as { error?: string; strategy?: Strategy }
      if (!res.ok) throw new Error(j.error || 'יצירת אסטרטגיה נכשלה')
      await refresh()
      if (j.strategy) setSelected(j.strategy)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function review(strategyId: string, decision: 'approved' | 'rejected') {
    setBusy(true)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/strategies',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId, decision }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'עדכון נכשל')
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  const plan = selected?.plan

  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold text-white">אסטרטגיה</h2>
            <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
              יעד עסקי → Marketing Director → Campaign Plan מובנה (Zod) לאישור לפני קמפיין.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createDefaultObjective()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
          >
            {busy ? 'עובד…' : 'צור יעד במקור + אסטרטגיה'}
          </button>
        </div>

        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="mbrain-card space-y-3 p-4 lg:col-span-1">
            <h3 className="text-sm font-medium text-white">יעדים</h3>
            {objectives.length === 0 ? (
              <p className="text-xs text-[var(--mbrain-muted)]">אין יעדים עדיין</p>
            ) : (
              objectives.map((o) => (
                <div key={o.id} className="rounded-lg border border-white/5 p-3">
                  <p className="text-sm text-white">{o.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--mbrain-muted)]">
                    {o.daily_budget ?? '—'} ₪/יום · CPL≤{o.max_cpl ?? '—'} · {o.status}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-2 text-xs text-[var(--mbrain-accent)]"
                    onClick={() => void generateFor(o.id)}
                  >
                    צור/רענן אסטרטגיה
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="mbrain-card space-y-4 p-5 lg:col-span-2">
            {!plan ? (
              <p className="text-sm text-[var(--mbrain-muted)]">בחר או צור אסטרטגיה לצפייה.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xl text-white">Campaign Plan v{selected?.version}</h3>
                    <p className="text-xs text-[var(--mbrain-muted)]">
                      {selected?.status} · {selected?.model_provider} · עלות AI $
                      {Number(selected?.generation_cost_usd ?? 0).toFixed(4)}
                    </p>
                  </div>
                  {selected?.status === 'pending_review' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(selected.id, 'approved')}
                        className="rounded-lg bg-[var(--mbrain-good)]/20 px-3 py-2 text-sm text-[var(--mbrain-good)]"
                      >
                        אשר אסטרטגיה
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(selected.id, 'rejected')}
                        className="rounded-lg bg-[var(--mbrain-bad)]/20 px-3 py-2 text-sm text-[var(--mbrain-bad)]"
                      >
                        דחה
                      </button>
                    </div>
                  ) : null}
                </div>

                <Field label="יעד" value={plan.objective} />
                <Field
                  label="ICP"
                  value={`${plan.idealCustomerProfile.name} — ${plan.idealCustomerProfile.description}`}
                />
                <Field label="מיצוב" value={plan.positioning} />
                <List label="כאבים" items={plan.painPoints} />
                <List label="הצעות" items={plan.offers} />
                <div>
                  <p className="text-xs text-[var(--mbrain-muted)]">זוויות קריאייטיב</p>
                  <ul className="mt-2 space-y-2">
                    {plan.creativeAngles.map((a) => (
                      <li key={a.angle} className="rounded-lg bg-black/20 p-3 text-sm">
                        <p className="text-white">{a.angle}</p>
                        <p className="text-[var(--mbrain-muted)]">Hook: {a.hook}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <List label="תנאי עצירה" items={plan.stopConditions} />
                <List label="כללי אופטימיזציה" items={plan.optimizationRules} />
              </>
            )}
          </section>
        </div>
      </div>
    </BrainShell>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--mbrain-muted)]">{label}</p>
      <p className="mt-1 text-sm text-white">{value}</p>
    </div>
  )
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs text-[var(--mbrain-muted)]">{label}</p>
      <ul className="mt-1 list-disc pr-5 text-sm text-white">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
