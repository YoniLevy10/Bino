'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Approval = {
  id: string
  action_type: string
  status: string
  budget_approved: number | null
  payload: Record<string, unknown>
  created_at: string
  target_id: string
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLaunch, setLastLaunch] = useState<Record<string, unknown> | null>(null)

  async function load() {
    const res = await fetchWithTimeout('/api/mbrain/approvals')
    if (!res.ok) throw new Error('שגיאה בטעינת אישורים')
    const j = (await res.json()) as { approvals: Approval[] }
    setApprovals(j.approvals)
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function decide(approvalId: string, decision: 'approved' | 'rejected') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/approvals',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approvalId, decision, executeLaunch: true }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { error?: string; launch?: Record<string, unknown> }
      if (!res.ok) throw new Error(j.error || 'פעולה נכשלה')
      if (j.launch) setLastLaunch(j.launch)
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
          <h2 className="text-3xl font-semibold text-white">אישורים</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            השקה / העלאת תקציב / שינוי גאוגרפיה — רק אחרי אישור אנושי + בדיקת מגבלות.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}
        {lastLaunch ? (
          <div className="mbrain-card p-4 text-sm text-[var(--mbrain-good)]">
            השקה בוצעה · Meta mode: {String(lastLaunch.metaMode)} · label: {String(lastLaunch.label)}
          </div>
        ) : null}
        <div className="space-y-3">
          {approvals.map((a) => (
            <article key={a.id} className="mbrain-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-white">{a.action_type}</p>
                  <p className="text-xs text-[var(--mbrain-muted)]">
                    {a.status} · תקציב מאושר: {a.budget_approved ?? '—'} ₪ · {new Date(a.created_at).toLocaleString('he-IL')}
                  </p>
                </div>
                {a.status === 'pending' ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(a.id, 'approved')}
                      className="rounded-lg bg-[var(--mbrain-good)]/20 px-3 py-2 text-sm text-[var(--mbrain-good)]"
                    >
                      אשר והשק
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(a.id, 'rejected')}
                      className="rounded-lg bg-[var(--mbrain-bad)]/20 px-3 py-2 text-sm text-[var(--mbrain-bad)]"
                    >
                      דחה
                    </button>
                  </div>
                ) : null}
              </div>
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-[11px] text-[var(--mbrain-muted)]">
                {JSON.stringify(a.payload, null, 2)}
              </pre>
            </article>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
