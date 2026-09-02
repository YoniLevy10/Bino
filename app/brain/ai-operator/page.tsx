'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Card = {
  type: string
  titleHe: string
  bodyHe: string
  meta?: Record<string, unknown>
}

type Turn = {
  role: 'user' | 'assistant'
  text: string
  intent?: string
  cards?: Card[]
}

const SUGGESTIONS = [
  'תבנה לי קמפיין לידים חדש לבמקור',
  'למה ה-CPL עלה השבוע?',
  'איזה קריאייטיב הכי טוב?',
  'תיצור 5 וריאציות למודעה המנצחת',
  'תכין קמפיין חדש בתקציב 100 ₪ ביום',
  'תעצור מודעות שמפסידות',
]

export default function AiOperatorPage() {
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: 'assistant',
      text: 'אני מנהל השיווק שלך לבמקור. תגיד מה המטרה — תקציב, CPL, קהל — ואני אבנה אסטרטגיה, קריאייטיב וטיוטת קמפיין. הוצאה אמיתית רק אחרי אישור שלך.',
    },
  ])
  const [busy, setBusy] = useState(false)

  async function send(message: string) {
    const trimmed = message.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setTurns((t) => [...t, { role: 'user', text: trimmed }])
    setInput('')
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/operator',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: trimmed }),
        },
        120_000
      )
      const j = (await res.json()) as {
        error?: string
        replyHe?: string
        intent?: string
        cards?: Card[]
      }
      if (!res.ok) throw new Error(j.error || 'המפעיל נכשל')
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          text: j.replyHe || '',
          intent: j.intent,
          cards: j.cards,
        },
      ])
    } catch (e) {
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          text: e instanceof Error ? e.message : 'שגיאה',
          cards: [{ type: 'error', titleHe: 'שגיאה', bodyHe: String(e) }],
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-white">מפעיל AI</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            מנהל שיווק עם כלים אמיתיים — לא צ׳אטבוט. פעולות כסף דורשות אישור.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => void send(s)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[var(--mbrain-muted)] hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mbrain-card flex max-h-[60vh] flex-col gap-4 overflow-y-auto p-4">
          {turns.map((turn, i) => (
            <div key={`${turn.role}-${i}`} className={turn.role === 'user' ? 'text-left' : ''}>
              <div
                className={`inline-block max-w-full rounded-2xl px-4 py-3 text-sm ${
                  turn.role === 'user'
                    ? 'bg-[var(--mbrain-accent)] text-white'
                    : 'bg-black/30 text-[var(--mbrain-ink)]'
                }`}
              >
                {turn.intent ? (
                  <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{turn.intent}</p>
                ) : null}
                <p className="whitespace-pre-wrap">{turn.text}</p>
              </div>
              {turn.cards?.map((c, ci) => (
                <div
                  key={`${c.type}-${ci}`}
                  className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm"
                >
                  <p className="font-medium text-white">{c.titleHe}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--mbrain-muted)]">{c.bodyHe}</p>
                  {c.type === 'approval_required' ? (
                    <Link href="/brain/approvals" className="mt-2 inline-block text-xs text-[var(--mbrain-accent)]">
                      מעבר לאישורים →
                    </Link>
                  ) : null}
                  {c.type === 'strategy_created' ? (
                    <Link href="/brain/strategy" className="mt-2 inline-block text-xs text-[var(--mbrain-accent)]">
                      סקירת אסטרטגיה →
                    </Link>
                  ) : null}
                  {c.type === 'generated_creatives' ? (
                    <Link href="/brain/creatives" className="mt-2 inline-block text-xs text-[var(--mbrain-accent)]">
                      ספריית קריאייטיב →
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void send(input)
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="לדוגמה: תביא לי 20 לידים מותאמים עד ₪150 CPL…"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-5 py-3 text-sm text-white disabled:opacity-60"
          >
            {busy ? '…' : 'שלח'}
          </button>
        </form>
      </div>
    </BrainShell>
  )
}
