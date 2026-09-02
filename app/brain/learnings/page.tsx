'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Learning = {
  id: string
  category: string
  statement: string
  confidence: number
  status: string
}

export default function LearningsPage() {
  const [learnings, setLearnings] = useState<Learning[]>([])
  const [statement, setStatement] = useState('')
  const [category, setCategory] = useState('message')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetchWithTimeout('/api/growth/learnings')
    if (!res.ok) throw new Error('שגיאה')
    const j = (await res.json()) as { learnings: Learning[] }
    setLearnings(j.learnings)
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/learnings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, statement, status: 'hypothesis', confidence: 0.5 }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'שמירה נכשלה')
      }
      setStatement('')
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
          <h2 className="text-3xl font-semibold text-white">למידות</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            זיכרון מובנה שמשפיע על החלטות עתידיות — לא רק צ׳אט.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <section className="mbrain-card space-y-3 p-5">
          <select
            className="w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {['icp', 'message', 'creative', 'channel', 'offer', 'other'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white"
            rows={3}
            placeholder='לדוגמה: מסר "הפחתת שיחות דיירים" ממיר טוב יותר מ"טרנספורמציה דיגיטלית"'
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || statement.length < 5}
            onClick={() => void create()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            שמור השערת למידה
          </button>
        </section>

        <div className="space-y-3">
          {learnings.map((l) => (
            <article key={l.id} className="mbrain-card p-4">
              <p className="text-xs uppercase text-[var(--mbrain-muted)]">
                {l.category} · {l.status} · conf {l.confidence}
              </p>
              <p className="mt-1 text-sm text-white">{l.statement}</p>
            </article>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
