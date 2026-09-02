'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { BrainShell } from '../../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type BrandDetail = {
  brand: { id: string; name: string; website: string | null; status: string }
  profile: {
    product_description: string | null
    target_customers: string | null
    customer_pains: string[]
    value_propositions: string[]
    differentiators: string[]
    prohibited_claims: string[]
    icps: Array<{ name: string; status?: string; notes?: string }>
  } | null
  hypotheses: Array<{
    id: string
    title: string
    statement: string
    creative_angle: string
    target_pain: string | null
    status: string
  }>
}

export default function BrandDetailPage() {
  const params = useParams<{ brandId: string }>()
  const [data, setData] = useState<BrandDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [desc, setDesc] = useState('')
  const [targets, setTargets] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithTimeout(`/api/mbrain/brands/${params.brandId}`)
        if (!res.ok) throw new Error('שגיאה בטעינת מותג')
        const j = (await res.json()) as BrandDetail
        setData(j)
        setDesc(j.profile?.product_description ?? '')
        setTargets(j.profile?.target_customers ?? '')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה')
      }
    })()
  }, [params.brandId])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        `/api/mbrain/brands/${params.brandId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_description: desc,
            target_customers: targets,
            onboarding_completed_at: new Date().toISOString(),
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || 'שמירה נכשלה')
      }
      const j = (await res.json()) as { profile: BrandDetail['profile'] }
      setData((prev) => (prev ? { ...prev, profile: j.profile } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSaving(false)
    }
  }

  if (error && !data) {
    return (
      <BrainShell>
        <p className="text-[var(--mbrain-bad)]">{error}</p>
      </BrainShell>
    )
  }

  if (!data) {
    return (
      <BrainShell>
        <p className="text-[var(--mbrain-muted)]">טוען…</p>
      </BrainShell>
    )
  }

  return (
    <BrainShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">{data.brand.name}</h2>
          <p className="text-sm text-[var(--mbrain-muted)]">{data.brand.website || 'ללא אתר'}</p>
        </div>

        <section className="mbrain-card space-y-4 p-5">
          <h3 className="text-lg text-white">Brand Brain</h3>
          <label className="block text-sm text-[var(--mbrain-muted)]">
            תיאור מוצר
            <textarea
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white"
              rows={4}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </label>
          <label className="block text-sm text-[var(--mbrain-muted)]">
            קהל יעד
            <textarea
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white"
              rows={2}
              value={targets}
              onChange={(e) => setTargets(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {saving ? 'שומר…' : 'שמור פרופיל'}
          </button>
        </section>

        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">כאבים (השערות)</h3>
          <ul className="mt-3 list-disc pr-5 text-sm text-[var(--mbrain-muted)]">
            {(data.profile?.customer_pains ?? []).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>

        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">זוויות קריאייטיב לניסוי</h3>
          <div className="mt-3 space-y-4">
            {data.hypotheses.map((h) => (
              <div key={h.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
                <p className="font-medium text-white">{h.creative_angle}</p>
                <p className="mt-1 text-sm text-[var(--mbrain-muted)]">{h.statement}</p>
                <p className="mt-1 text-xs text-[var(--mbrain-muted)]">
                  כאב: {h.target_pain || '—'} · סטטוס: {h.status}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mbrain-card p-5">
          <h3 className="text-lg text-white">ICP</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {(data.profile?.icps ?? []).map((icp) => (
              <li key={icp.name} className="text-[var(--mbrain-muted)]">
                <span className="text-white">{icp.name}</span>
                {icp.status ? ` · ${icp.status}` : ''}
                {icp.notes ? ` — ${icp.notes}` : ''}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </BrainShell>
  )
}
