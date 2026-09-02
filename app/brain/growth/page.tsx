'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Overview = {
  northStar: { noteHe: string; demos: number; spend: number | null }
  leads: { total: number; hot: number; warm: number; qualified: number; demos: number }
  recommendationsHe: string[]
  pendingPlans: Array<{ id: string; estimated_budget: number | null }>
  goals: Array<{ id: string; title: string; status: string; target_demos: number | null }>
  meta: { label: string }
}

type Plan = {
  id: string
  status: string
  plan: {
    objective: string
    targetDemos: number | null
    estimatedBudget: number | null
    channels: Array<{ channel: string; allocationPct: number; descriptionHe: string }>
    experiments: Array<{ name: string; hypothesis: string }>
    icpVariants: string[]
    messagingAngles: string[]
    risks: string[]
  }
}

export default function GrowthBrainPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [brief, setBrief] = useState('תביא לי 10 דמואים חדשים מחברות ניהול בשבועיים הקרובים')
  const [targetDemos, setTargetDemos] = useState(10)
  const [maxBudget, setMaxBudget] = useState(3000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastPlan, setLastPlan] = useState<Plan['plan'] | null>(null)

  async function load() {
    const [oRes, gRes] = await Promise.all([
      fetchWithTimeout('/api/growth/overview'),
      fetchWithTimeout('/api/growth/goals'),
    ])
    if (oRes.ok) setOverview((await oRes.json()) as Overview)
    if (gRes.ok) {
      const j = (await gRes.json()) as { plans: Plan[] }
      setPlans(j.plans.filter((p) => p.status === 'pending_approval'))
    }
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function createGoal() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/goals',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: brief,
            targetDemos,
            windowDays: 14,
            maxBudget,
            rawBrief: brief,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { error?: string; planBody?: Plan['plan'] }
      if (!res.ok) throw new Error(j.error || 'יצירה נכשלה')
      setLastPlan(j.planBody ?? null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function review(planId: string, decision: 'approved' | 'rejected') {
    setBusy(true)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/plans/review',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId, decision }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'אישור נכשל')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrainShell metaLabel={overview?.meta.label ?? 'MOCK DATA'}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">Growth Brain</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            יעד עסקי → תוכנית לאישור → משימות. בלי הוצאה אוטומטית.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        {overview ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['לידים', String(overview.leads.total)],
              ['HOT/WARM', `${overview.leads.hot}/${overview.leads.warm}`],
              ['דמואים', String(overview.leads.demos)],
              ['הוצאה', overview.northStar.spend != null ? `₪${overview.northStar.spend}` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="mbrain-card p-4">
                <p className="text-xs text-[var(--mbrain-muted)]">{k}</p>
                <p className="mt-1 text-2xl text-white">{v}</p>
              </div>
            ))}
          </div>
        ) : null}

        {overview?.recommendationsHe?.length ? (
          <section className="mbrain-card p-4">
            <h3 className="text-white">מה ה-AI ממליץ עכשיו</h3>
            <ul className="mt-2 list-disc pr-5 text-sm text-[var(--mbrain-muted)]">
              {overview.recommendationsHe.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--mbrain-muted)]">{overview.northStar.noteHe}</p>
          </section>
        ) : null}

        <section className="mbrain-card space-y-3 p-5">
          <h3 className="text-lg text-white">פקודה עסקית</h3>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white"
            rows={3}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-[var(--mbrain-muted)]">
              יעד דמואים
              <input
                type="number"
                className="mt-1 block w-28 rounded-lg border border-white/10 bg-black/30 p-2 text-white"
                value={targetDemos}
                onChange={(e) => setTargetDemos(Number(e.target.value))}
              />
            </label>
            <label className="text-xs text-[var(--mbrain-muted)]">
              תקציב מקס׳ ₪
              <input
                type="number"
                className="mt-1 block w-28 rounded-lg border border-white/10 bg-black/30 p-2 text-white"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || brief.length < 3}
            onClick={() => void createGoal()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
          >
            בנה תוכנית לאישור
          </button>
        </section>

        {(lastPlan || plans[0]) && (
          <section className="mbrain-card space-y-3 p-5">
            <h3 className="text-lg text-white">תוכנית מוצעת</h3>
            {(() => {
              const p = lastPlan ?? plans[0]?.plan
              if (!p) return null
              return (
                <>
                  <p className="text-sm text-white">{p.objective}</p>
                  <p className="text-xs text-[var(--mbrain-muted)]">
                    יעד: {p.targetDemos ?? '—'} דמואים · תקציב משוער:{' '}
                    {p.estimatedBudget != null ? `₪${p.estimatedBudget}` : '—'}
                  </p>
                  <ul className="space-y-1 text-sm text-[var(--mbrain-muted)]">
                    {p.channels.map((c) => (
                      <li key={c.channel}>
                        {c.allocationPct}% · {c.channel}: {c.descriptionHe}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {plans[0] ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void review(plans[0].id, 'approved')}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
                        >
                          אשר תוכנית
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void review(plans[0].id, 'rejected')}
                          className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white"
                        >
                          דחה
                        </button>
                      </>
                    ) : null}
                    <Link href="/brain/campaign-pack" className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white">
                      חבילת קמפיין ראשונה
                    </Link>
                  </div>
                </>
              )
            })()}
          </section>
        )}
      </div>
    </BrainShell>
  )
}
