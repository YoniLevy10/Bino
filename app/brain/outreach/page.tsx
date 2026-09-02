'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Sequence = {
  id: string
  name: string
  channel: string
  description: string | null
  growth_sequence_steps?: Array<{ step_order: number; delay_days: number; angle: string | null }>
}

type Lead = {
  id: string
  score: number
  score_band: string
  growth_companies: { name: string } | null
}

type Enrollment = {
  id: string
  status: string
  current_step: number
  growth_leads: { growth_companies: { name: string } | null } | null
}

export default function OutreachPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [seqId, setSeqId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [sRes, lRes] = await Promise.all([
      fetchWithTimeout('/api/growth/sequences'),
      fetchWithTimeout('/api/growth/leads'),
    ])
    if (sRes.ok) {
      const j = (await sRes.json()) as { sequences: Sequence[]; enrollments: Enrollment[] }
      setSequences(j.sequences)
      setEnrollments(j.enrollments)
      if (j.sequences[0] && !seqId) setSeqId(j.sequences[0].id)
    }
    if (lRes.ok) {
      const j = (await lRes.json()) as { leads: Lead[] }
      setLeads(j.leads)
      if (j.leads[0] && !leadId) setLeadId(j.leads[0].id)
    }
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function seed() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/sequences',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'seed_defaults' }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'כשל')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function enroll() {
    setBusy(true)
    setError(null)
    setDraft(null)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/sequences/enroll',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sequenceId: seqId, leadId }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as {
        error?: string
        draftInteraction?: { body?: string; subject?: string }
        noteHe?: string
      }
      if (!res.ok) throw new Error(j.error || 'רישום נכשל')
      setDraft(
        [j.draftInteraction?.subject, j.draftInteraction?.body, j.noteHe].filter(Boolean).join('\n\n')
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  async function mark(action: 'mark_replied' | 'demo_booked' | 'opt_out') {
    if (!leadId) return
    setBusy(true)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/interactions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, leadId }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        const j = (await res.json()) as { error?: string }
        throw new Error(j.error || 'פעולה נכשלה')
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
          <h2 className="text-3xl font-semibold text-white">אאוטבאונד</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            רצפים מותאמים · עצירה בתשובה/opt-out/דמו · בלי ספאם אוטומטי.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void seed()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2 text-sm text-white"
          >
            טען 3 רצפי במקור
          </button>
        </div>

        <section className="mbrain-card space-y-3 p-5">
          <h3 className="text-white">רישום ליד לרצף</h3>
          <label className="block text-xs text-[var(--mbrain-muted)]">
            רצף
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white"
              value={seqId}
              onChange={(e) => setSeqId(e.target.value)}
            >
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.channel})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-[var(--mbrain-muted)]">
            ליד
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white"
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.growth_companies?.name ?? l.id} · {l.score_band} {l.score}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !seqId || !leadId}
            onClick={() => void enroll()}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            צור טיוטת פנייה ראשונה
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !leadId} onClick={() => void mark('mark_replied')} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white">
              סומן כהשיב → עצור רצף
            </button>
            <button type="button" disabled={busy || !leadId} onClick={() => void mark('demo_booked')} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white">
              נקבע דמו
            </button>
            <button type="button" disabled={busy || !leadId} onClick={() => void mark('opt_out')} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white">
              Opt-out
            </button>
          </div>
          {draft ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-[var(--mbrain-muted)]">
              {draft}
            </pre>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-white">רצפים</h3>
          {sequences.map((s) => (
            <article key={s.id} className="mbrain-card p-4">
              <p className="text-white">{s.name}</p>
              <p className="text-xs text-[var(--mbrain-muted)]">
                {s.channel} · {s.growth_sequence_steps?.length ?? 0} שלבים · {s.description}
              </p>
            </article>
          ))}
        </section>

        <section className="space-y-2">
          <h3 className="text-white">הרשמות</h3>
          {enrollments.map((e) => (
            <article key={e.id} className="mbrain-card p-3 text-sm text-[var(--mbrain-muted)]">
              {e.growth_leads?.growth_companies?.name ?? e.id} · {e.status} · שלב {e.current_step}
            </article>
          ))}
        </section>
      </div>
    </BrainShell>
  )
}
