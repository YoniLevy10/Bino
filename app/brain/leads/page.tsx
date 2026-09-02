'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

type Lead = {
  id: string
  status: string
  score: number
  score_band: string
  score_reasons: Array<{ labelHe: string; points: number }>
  growth_companies: { name: string; website: string | null; city: string | null } | null
  growth_contacts: { full_name: string | null; role: string | null } | null
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    companyName: '',
    website: '',
    city: '',
    phone: '',
    contactName: '',
    contactRole: '',
    buildingsCountEst: '',
  })

  async function load() {
    const res = await fetchWithTimeout('/api/growth/leads')
    if (!res.ok) throw new Error('שגיאה בטעינת לידים')
    const j = (await res.json()) as { leads: Lead[] }
    setLeads(j.leads)
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function createLead() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/growth/leads',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: form.companyName,
            website: form.website || null,
            city: form.city || null,
            phone: form.phone || null,
            contactName: form.contactName || null,
            contactRole: form.contactRole || null,
            buildingsCountEst: form.buildingsCountEst ? Number(form.buildingsCountEst) : null,
            signals: {
              managesMultipleBuildings: Number(form.buildingsCountEst || 0) >= 2,
              relevantPmcCategory: true,
              activeWebsite: Boolean(form.website),
              whatsappOrPublicContact: Boolean(form.phone),
              operationalContactFound: Boolean(form.contactName),
              geographicFitIsrael: true,
            },
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'יצירה נכשלה')
      setForm({
        companyName: '',
        website: '',
        city: '',
        phone: '',
        contactName: '',
        contactRole: '',
        buildingsCountEst: '',
      })
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
          <h2 className="text-3xl font-semibold text-white">לידים — Growth CRM</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            ניקוד שקוף (HOT/WARM/COLD). לא ממציאים נתונים — רק מה שיש.
          </p>
        </div>
        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <section className="mbrain-card grid gap-3 p-5 md:grid-cols-2">
          <h3 className="md:col-span-2 text-lg text-white">הוספת חברת ניהול</h3>
          {(
            [
              ['companyName', 'שם חברה'],
              ['website', 'אתר'],
              ['city', 'עיר'],
              ['phone', 'טלפון ציבורי'],
              ['contactName', 'איש קשר'],
              ['contactRole', 'תפקיד'],
              ['buildingsCountEst', 'מספר בניינים (אם ידוע)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-xs text-[var(--mbrain-muted)]">
              {label}
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white"
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={busy || !form.companyName}
            onClick={() => void createLead()}
            className="md:col-span-2 rounded-xl bg-[var(--mbrain-accent)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
          >
            שמור ודרג
          </button>
        </section>

        <div className="space-y-3">
          {leads.map((l) => (
            <article key={l.id} className="mbrain-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-white">{l.growth_companies?.name ?? '—'}</p>
                  <p className="text-xs text-[var(--mbrain-muted)]">
                    {l.growth_companies?.city || '—'} · {l.growth_contacts?.full_name || 'ללא איש קשר'}
                    {l.growth_contacts?.role ? ` (${l.growth_contacts.role})` : ''}
                  </p>
                </div>
                <div className="text-left">
                  <p className="text-2xl font-semibold text-white">{l.score}</p>
                  <p className="text-xs uppercase text-[var(--mbrain-muted)]">{l.score_band}</p>
                </div>
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {(l.score_reasons ?? []).map((r) => (
                  <li
                    key={r.labelHe}
                    className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-[var(--mbrain-muted)]"
                  >
                    +{r.points} {r.labelHe}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--mbrain-muted)]">סטטוס: {l.status}</p>
            </article>
          ))}
        </div>
      </div>
    </BrainShell>
  )
}
