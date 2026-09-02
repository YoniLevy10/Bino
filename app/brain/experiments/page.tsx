'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Experiment = {
  id: string
  name: string
  hypothesis: string
  status: string
  primary_metric: string
  budget_total: number | null
  growth_experiment_arms?: Array<{ name: string; variant_key: string }>
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetchWithTimeout('/api/growth/experiments')
    if (!res.ok) throw new Error('שגיאה בטעינת ניסויים')
    const j = (await res.json()) as { experiments: Experiment[] }
    setExperiments(j.experiments)
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function seedMatrix() {
    setBusy(true)
    setError(null)
    try {
      const matrix = [
        {
          name: 'Chaos vs Cost messaging',
          hypothesis: 'מסר כאוס־וואטסאפ ימיר לדמו טוב יותר ממסר חיסכון',
          budgetTotal: 1200,
          arms: [
            { name: 'WhatsApp chaos', variantKey: 'whatsapp_chaos' },
            { name: 'Cost savings', variantKey: 'cost_savings' },
          ],
        },
        {
          name: 'Owner vs Ops audience',
          hypothesis: 'מנהלי תפעול יגיבו טוב יותר להודעות SLA',
          budgetTotal: 1000,
          arms: [
            { name: 'Owner/CEO', variantKey: 'owner_ceo' },
            { name: 'Ops manager', variantKey: 'ops_manager' },
          ],
        },
      ]
      for (const m of matrix) {
        const res = await fetchWithTimeout(
          '/api/growth/experiments',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(m),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        if (!res.ok) {
          const j = (await res.json()) as { error?: string }
          throw new Error(j.error || 'יצירה נכשלה')
        }
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">ניסויים</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            כל מסר/קהל/הצעה = ניסוי. טיוטות בלבד עד אישור השקה.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void seedMatrix()}
          className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2 text-sm text-white"
        >
          צור מטריצת ניסויים ראשונה (טיוטה)
        </button>
        <div className="space-y-3">
          {experiments.map((ex) => (
            <article key={ex.id} className="mbrain-card p-4">
              <div className="flex justify-between gap-3">
                <p className="text-white">{ex.name}</p>
                <span className="text-xs uppercase text-[var(--mbrain-muted)]">{ex.status}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--mbrain-muted)]">{ex.hypothesis}</p>
              <p className="mt-2 text-xs text-[var(--mbrain-muted)]">
                מדד: {ex.primary_metric}
                {ex.budget_total != null ? ` · תקציב ₪${ex.budget_total}` : ''}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {(ex.growth_experiment_arms ?? []).map((a) => (
                  <li key={a.variant_key} className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-[var(--mbrain-muted)]">
                    {a.name}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
