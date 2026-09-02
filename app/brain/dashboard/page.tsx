'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type DashboardPayload = {
  organization: { name: string; autonomy_mode: string }
  brands: Array<{ id: string; name: string; slug: string }>
  hypotheses: Array<{ id: string; title: string; creative_angle: string; status: string }>
  meta: { mode: string; label: string; graphApiVersion: string }
  kpis: {
    spend: number | null
    leads: number | null
    cpl: number | null
    ctr: number | null
    cpc: number | null
    conversionRate: number | null
    noteHe: string
  }
  pendingApprovals: number
  aiRecommendations: Array<{ id: string; title: string }>
}

function fmt(v: number | null, suffix = ''): string {
  if (v == null) return '—'
  return `${v}${suffix}`
}

export default function BrainDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)

  async function load() {
    setError(null)
    try {
      const res = await fetchWithTimeout('/api/mbrain/dashboard', {}, 20000)
      if (res.status === 403) {
        const j = (await res.json()) as { code?: string; error?: string }
        if (j.code === 'MBRAIN_NO_MEMBERSHIP') {
          setError('no_membership')
          return
        }
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'שגיאה בטעינת לוח הבקרה')
      }
      setData((await res.json()) as DashboardPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function bootstrap() {
    setBootstrapping(true)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/bootstrap',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        20000
      )
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'כשל בהצטרפות')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBootstrapping(false)
    }
  }

  if (error === 'no_membership') {
    return (
      <BrainShell>
        <div className="mbrain-card mx-auto max-w-lg p-8 text-center">
          <h2 className="text-2xl font-semibold text-white">ברוך הבא ל-Marketing Brain</h2>
          <p className="mt-3 text-sm text-[var(--mbrain-muted)]">
            החשבון שלך עדיין לא משויך לארגון. אם זה הסביבה הראשונה — ניתן להצטרף לארגון Levy
            Marketing ולהתחיל עם מותג במקור.
          </p>
          <button
            type="button"
            disabled={bootstrapping}
            onClick={() => void bootstrap()}
            className="mt-6 rounded-xl bg-[var(--mbrain-accent)] px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {bootstrapping ? 'מצרף…' : 'הצטרף לארגון והתחל'}
          </button>
        </div>
      </BrainShell>
    )
  }

  if (error) {
    return (
      <BrainShell>
        <div className="mbrain-card p-6 text-[var(--mbrain-bad)]">{error}</div>
      </BrainShell>
    )
  }

  if (!data) {
    return (
      <BrainShell>
        <div className="mbrain-card p-6 text-[var(--mbrain-muted)]">טוען לוח בקרה…</div>
      </BrainShell>
    )
  }

  const k = data.kpis

  return (
    <BrainShell metaLabel={data.meta.label}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--mbrain-muted)]">{data.organization.name}</p>
            <h2 className="text-3xl font-semibold text-white">לוח בקרה תפעולי</h2>
            <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
              מצב אוטונומיה: {data.organization.autonomy_mode} · Meta API {data.meta.graphApiVersion}
            </p>
          </div>
          <Link
            href="/brain/ai-operator"
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2.5 text-sm font-medium text-white"
          >
            פתח מפעיל AI
          </Link>
        </div>

        <p className="text-xs text-[var(--mbrain-muted)]">{k.noteHe}</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'הוצאה', value: fmt(k.spend, ' ₪') },
            { label: 'לידים', value: fmt(k.leads) },
            { label: 'CPL', value: fmt(k.cpl, ' ₪') },
            { label: 'CTR', value: fmt(k.ctr, '%') },
            { label: 'CPC', value: fmt(k.cpc, ' ₪') },
            { label: 'המרה', value: fmt(k.conversionRate, '%') },
          ].map((kpi) => (
            <div key={kpi.label} className="mbrain-card p-4">
              <div className="mbrain-kpi-value">{kpi.value}</div>
              <div className="mbrain-kpi-label">{kpi.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="mbrain-card p-5">
            <h3 className="text-lg font-medium text-white">מותגים</h3>
            <ul className="mt-3 space-y-2">
              {data.brands.map((b) => (
                <li key={b.id}>
                  <Link href={`/brain/brands/${b.id}`} className="text-[var(--mbrain-accent)] hover:underline">
                    {b.name}
                  </Link>
                  <span className="mr-2 text-xs text-[var(--mbrain-muted)]">/{b.slug}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mbrain-card p-5">
            <h3 className="text-lg font-medium text-white">השערות שיווקיות (לא מוכחות)</h3>
            <ul className="mt-3 space-y-3">
              {data.hypotheses.slice(0, 5).map((h) => (
                <li key={h.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                  <p className="text-sm text-white">{h.creative_angle}</p>
                  <p className="text-xs text-[var(--mbrain-muted)]">{h.title} · {h.status}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="mbrain-card p-5">
            <h3 className="text-lg font-medium text-white">ממתין לאישור</h3>
            <p className="mt-2 text-3xl font-semibold text-white">{data.pendingApprovals}</p>
            <Link href="/brain/approvals" className="mt-3 inline-block text-sm text-[var(--mbrain-accent)]">
              מעבר לאישורים
            </Link>
          </section>
          <section className="mbrain-card p-5">
            <h3 className="text-lg font-medium text-white">המלצת AI הבאה</h3>
            {data.aiRecommendations.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--mbrain-muted)]">
                אין עדיין המלצות — לאחר סנכרון Insights יופיעו כאן.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {data.aiRecommendations.map((r) => (
                  <li key={r.id}>{r.title}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </BrainShell>
  )
}
