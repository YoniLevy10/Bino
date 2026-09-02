'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Pack = {
  objectiveHe: string
  recommendedTestBudgetIls: number
  icpVariants: string[]
  marketingAngles: string[]
  hooks: string[]
  offers: Array<{ titleHe: string; descriptionHe: string }>
  experimentMatrix: Array<{ name: string; hypothesis: string; suggestedBudgetIls: number }>
  successCriteria: string[]
  trackingPlan: string[]
  landingPageOutline: { hero: string; cta: string; formFields: string[] }
  metaAdConcepts: Array<{ hook: string; headline: string; angle: string }>
  outboundSequences: Array<{ name: string; channel: string }>
  autoLaunch: boolean
  status: string
}

export default function CampaignPackPage() {
  const [pack, setPack] = useState<Pack | null>(null)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creativeNote, setCreativeNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/growth/campaign-pack')
        if (!res.ok) throw new Error('שגיאה בטעינת חבילה')
        const j = (await res.json()) as { pack: Pack; warningHe: string }
        setPack(j.pack)
        setWarning(j.warningHe)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאה')
      }
    })()
  }, [])

  async function persistCreatives() {
    setBusy(true)
    setCreativeNote(null)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/creatives/batch',
        { method: 'POST' },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { noteHe?: string; warning?: string; persisted?: boolean }
      setCreativeNote(j.noteHe || j.warning || (j.persisted ? 'נשמר' : 'טיוטות בזיכרון בלבד'))
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
          <h2 className="text-3xl font-semibold text-white">חבילת קמפיין ראשונה</h2>
          <p className="mt-1 text-sm text-amber-200">{warning}</p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}
        {!pack ? (
          <p className="text-[var(--mbrain-muted)]">טוען…</p>
        ) : (
          <>
            <section className="mbrain-card p-5">
              <p className="text-white">{pack.objectiveHe}</p>
              <p className="mt-2 text-sm text-[var(--mbrain-muted)]">
                תקציב בדיקה מומלץ: ₪{pack.recommendedTestBudgetIls} · autoLaunch={String(pack.autoLaunch)} ·{' '}
                {pack.status}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void persistCreatives()}
                className="mt-3 rounded-xl bg-[var(--mbrain-accent)] px-4 py-2 text-sm text-white"
              >
                שמור 6 קונספטי Meta כטיוטות קריאייטיב
              </button>
              {creativeNote ? <p className="mt-2 text-xs text-[var(--mbrain-muted)]">{creativeNote}</p> : null}
            </section>

            <Section title="3 וריאנטי ICP" items={pack.icpVariants} />
            <Section title="5 זוויות שיווק" items={pack.marketingAngles} />
            <Section title="10 הוקים" items={pack.hooks} />

            <section className="mbrain-card p-5">
              <h3 className="text-white">6 קונספטי Meta</h3>
              <ul className="mt-2 space-y-2 text-sm text-[var(--mbrain-muted)]">
                {pack.metaAdConcepts.map((c) => (
                  <li key={c.hook}>
                    <span className="text-white">{c.headline}</span> — {c.hook} ({c.angle})
                  </li>
                ))}
              </ul>
            </section>

            <section className="mbrain-card p-5">
              <h3 className="text-white">3 רצפי אאוטבאונד</h3>
              <ul className="mt-2 text-sm text-[var(--mbrain-muted)]">
                {pack.outboundSequences.map((s) => (
                  <li key={s.name}>
                    {s.name} · {s.channel}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mbrain-card p-5">
              <h3 className="text-white">2 הצעות</h3>
              {pack.offers.map((o) => (
                <div key={o.titleHe} className="mt-2">
                  <p className="text-white">{o.titleHe}</p>
                  <p className="text-sm text-[var(--mbrain-muted)]">{o.descriptionHe}</p>
                </div>
              ))}
            </section>

            <section className="mbrain-card p-5">
              <h3 className="text-white">דף נחיתה (מבנה)</h3>
              <p className="mt-1 text-sm text-white">{pack.landingPageOutline.hero}</p>
              <p className="text-xs text-[var(--mbrain-muted)]">CTA: {pack.landingPageOutline.cta}</p>
              <p className="text-xs text-[var(--mbrain-muted)]">
                שדות: {pack.landingPageOutline.formFields.join(' · ')}
              </p>
            </section>

            <section className="mbrain-card p-5">
              <h3 className="text-white">מטריצת ניסויים</h3>
              {pack.experimentMatrix.map((ex) => (
                <div key={ex.name} className="mt-2 text-sm text-[var(--mbrain-muted)]">
                  <p className="text-white">{ex.name}</p>
                  <p>{ex.hypothesis}</p>
                  <p className="text-xs">₪{ex.suggestedBudgetIls}</p>
                </div>
              ))}
            </section>

            <Section title="מעקב" items={pack.trackingPlan} />
            <Section title="קריטריוני הצלחה" items={pack.successCriteria} />
          </>
        )}
      </div>
    </BrainShell>
  )
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="mbrain-card p-5">
      <h3 className="text-white">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pr-5 text-sm text-[var(--mbrain-muted)]">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </section>
  )
}
