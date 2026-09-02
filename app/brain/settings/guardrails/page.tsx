'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../../components/BrainShell'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type Guardrail = {
  id: string
  scope: string
  brand_id: string | null
  monthly_spend_limit: number | null
  daily_spend_limit: number | null
  max_campaign_daily_budget: number | null
  max_budget_increase_percentage: number | null
  max_cpl: number | null
  auto_pause_enabled: boolean
  currency: string
}

export default function GuardrailsPage() {
  const [rows, setRows] = useState<Guardrail[]>([])
  const [metaLabel, setMetaLabel] = useState('MOCK DATA')

  useEffect(() => {
    void (async () => {
      const res = await fetchWithTimeout('/api/mbrain/dashboard')
      if (!res.ok) return
      const j = (await res.json()) as { guardrails: Guardrail[]; meta: { label: string } }
      setRows(j.guardrails)
      setMetaLabel(j.meta.label)
    })()
  }, [])

  return (
    <BrainShell metaLabel={metaLabel}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">מגבלות הוצאה</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            הקוד הוא הסמכות הסופית — לא ה-LLM. כל פעולת הוצאה נבדקת מול הערכים האלה.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((g) => (
            <div key={g.id} className="mbrain-card p-5">
              <p className="text-xs uppercase tracking-wide text-[var(--mbrain-muted)]">{g.scope}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--mbrain-muted)]">תקרה חודשית</dt>
                  <dd className="text-white">
                    {g.monthly_spend_limit ?? '—'} {g.currency}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--mbrain-muted)]">תקרה יומית</dt>
                  <dd className="text-white">
                    {g.daily_spend_limit ?? '—'} {g.currency}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--mbrain-muted)]">מקס׳ תקציב קמפיין/יום</dt>
                  <dd className="text-white">
                    {g.max_campaign_daily_budget ?? '—'} {g.currency}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--mbrain-muted)]">מקס׳ העלאת תקציב</dt>
                  <dd className="text-white">{g.max_budget_increase_percentage ?? '—'}%</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--mbrain-muted)]">מקס׳ CPL</dt>
                  <dd className="text-white">
                    {g.max_cpl ?? '—'} {g.currency}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--mbrain-muted)]">השהיה אוטומטית</dt>
                  <dd className="text-white">{g.auto_pause_enabled ? 'כן' : 'לא'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
