'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'

type Creative = {
  id: string
  status: string
  format: string
  angle: string
  hook: string
  primary_text: string
  headline: string
  image_kind: string | null
  image_content: string | null
  image_provider: string | null
  created_at: string
  target_pain: string | null
}

export default function CreativesPage() {
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetchWithTimeout('/api/mbrain/creatives?brandId=' + BAMAKOR_BRAND_ID)
    if (!res.ok) throw new Error('שגיאה בטעינת קריאייטיב')
    const j = (await res.json()) as { creatives: Creative[] }
    setCreatives(j.creatives)
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function generate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/creatives',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId: BAMAKOR_BRAND_ID,
            formats: ['1:1', '4:5', '9:16'],
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'יצירה נכשלה')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(id: string, status: 'approved' | 'rejected' | 'archived') {
    setBusy(true)
    try {
      const res = await fetchWithTimeout(
        `/api/mbrain/creatives/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'עדכון נכשל')
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-semibold text-white">ספריית קריאייטיב</h2>
            <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
              כל וריאציה מקושרת להשערה. תבניות SVG בעלות אפס · מדדי Spend/CTR/CPL אחרי Insights.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
          >
            {busy ? 'מייצר…' : 'צור קריאייטיב מההשערות'}
          </button>
        </div>

        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {creatives.map((c) => (
            <article key={c.id} className="mbrain-card overflow-hidden">
              <div className="aspect-square bg-black/40">
                {c.image_kind === 'svg' && c.image_content ? (
                  <div
                    className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: c.image_content }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-[var(--mbrain-muted)]">
                    אין תמונה
                  </div>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--mbrain-muted)]">
                  <span>{c.format}</span>
                  <span>{c.status}</span>
                </div>
                <h3 className="text-sm font-medium text-white">{c.headline}</h3>
                <p className="line-clamp-2 text-xs text-[var(--mbrain-muted)]">{c.hook}</p>
                <p className="text-[11px] text-[var(--mbrain-muted)]">Angle: {c.angle}</p>
                <p className="text-[11px] text-[var(--mbrain-muted)]">
                  Spend/CTR/CPL: — (ממתין לסנכרון)
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-[var(--mbrain-good)]"
                    onClick={() => void setStatus(c.id, 'approved')}
                  >
                    אשר
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-[var(--mbrain-bad)]"
                    onClick={() => void setStatus(c.id, 'rejected')}
                  >
                    דחה
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs text-[var(--mbrain-muted)]"
                    onClick={() => void setStatus(c.id, 'archived')}
                  >
                    ארכיון
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
