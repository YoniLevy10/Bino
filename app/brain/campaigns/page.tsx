'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'

type Campaign = {
  id: string
  name: string
  status: string
  daily_budget: number | null
  meta_external_id: string | null
  objective: string
  landing_page_url: string | null
}

type Strategy = { id: string; status: string; version: number }

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [metaLabel, setMetaLabel] = useState('MOCK DATA')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [cRes, sRes] = await Promise.all([
      fetchWithTimeout('/api/mbrain/campaigns'),
      fetchWithTimeout('/api/mbrain/strategies'),
    ])
    if (cRes.ok) {
      const j = (await cRes.json()) as {
        campaigns: Campaign[]
        meta: { label: string }
      }
      setCampaigns(j.campaigns)
      setMetaLabel(j.meta.label)
    }
    if (sRes.ok) {
      const j = (await sRes.json()) as { strategies: Strategy[] }
      setStrategies(j.strategies.filter((s) => s.status === 'approved'))
    }
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function buildDraft(strategyId: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/campaigns',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: BAMAKOR_BRAND_ID,
            strategyId,
            landingPageUrl: 'https://bamakor.vercel.app',
            requestLaunchApproval: true,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as {
        error?: string
        preview?: Record<string, unknown>
        meta?: { label: string }
      }
      if (!res.ok) throw new Error(j.error || 'יצירת טיוטה נכשלה')
      setPreview(j.preview ?? null)
      if (j.meta?.label) setMetaLabel(j.meta.label)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrainShell metaLabel={metaLabel}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">קמפיינים</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            תוכנית מאושרת → טיוטת Meta → אישור השקה. כפילויות נחסמות ב-idempotency key.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">אסטרטגיות מאושרות</h3>
          {strategies.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--mbrain-muted)]">
              אין אסטרטגיה מאושרת — אשר ב־/brain/strategy ואשר קריאייטיבים קודם.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {strategies.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white">Strategy v{s.version}</span>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-sm text-[var(--mbrain-accent)]"
                    onClick={() => void buildDraft(s.id)}
                  >
                    בנה טיוטה + בקש אישור
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {preview ? (
          <section className="mbrain-card space-y-2 p-5">
            <h3 className="text-lg text-white">תצוגה מקדימה לפני השקה</h3>
            <pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs text-[var(--mbrain-muted)]">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </section>
        ) : null}

        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">קמפיינים</h3>
          <ul className="mt-3 space-y-3">
            {campaigns.map((c) => (
              <li key={c.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                <p className="text-white">{c.name}</p>
                <p className="text-xs text-[var(--mbrain-muted)]">
                  {c.status} · {c.daily_budget ?? '—'} ₪/יום · Meta ID: {c.meta_external_id ?? '—'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </BrainShell>
  )
}
