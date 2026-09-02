'use client'

import { BrainShell } from '../components/BrainShell'

const EXAMPLES = [
  'תבנה לי קמפיין לידים חדש לבמקור',
  'למה ה-CPL עלה השבוע?',
  'איזה קריאייטיב הכי טוב?',
  'תיצור 5 וריאציות למודעה המנצחת',
  'תעצור מודעות שמפסידות',
  'תכין קמפיין חדש בתקציב 100 ₪ ביום',
]

export default function AiOperatorPage() {
  return (
    <BrainShell metaLabel="MOCK DATA">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">מפעיל AI</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            מנהל שיווק עם כלים אמיתיים — לא צ׳אטבוט. פעולות רגישות עוברות דרך Approval Engine ומגבלות הוצאה.
          </p>
        </div>
        <div className="mbrain-card p-5">
          <p className="text-xs text-[var(--mbrain-muted)]">סיווג פקודות</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {['READ', 'CREATE DRAFT', 'GENERATE', 'CHANGE', 'SPEND'].map((t) => (
              <span key={t} className="rounded-md border border-white/10 px-2 py-1 text-[var(--mbrain-muted)]">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-6 space-y-2">
            {EXAMPLES.map((ex) => (
              <div key={ex} className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-white">
                {ex}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-[var(--mbrain-muted)]">
            שיחת Operator מלאה עם כרטיסי פעולה תגיע ב-Phase B–I. כרגע התשתית (providers, guardrails, audit)
            מוכנה.
          </p>
        </div>
      </div>
    </BrainShell>
  )
}
