'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../../components/BrainShell'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { BAMAKOR_BRAND_ID } from '@/lib/mbrain/types'

type ConnPayload = {
  meta: {
    mode: string
    label: string
    graphApiVersion: string
    appIdConfigured: boolean
    encryptionConfigured: boolean
  }
  connection: {
    status: string
    metaUserId: string | null
    tokenExpiresAt: string | null
    lastError: string | null
    hasToken: boolean
  } | null
  accounts: Array<{
    id: string
    ad_account_id: string
    ad_account_name: string | null
    page_id: string | null
    page_name: string | null
    pixel_id: string | null
    is_selected: boolean
    currency: string | null
  }>
  discovery: {
    pages: Array<{ id: string; name: string }> | null
  }
}

export default function IntegrationsPage() {
  const [data, setData] = useState<ConnPayload | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageId, setPageId] = useState('')
  const [selectedAccount, setSelectedAccount] = useState('')

  async function load() {
    const res = await fetchWithTimeout('/api/mbrain/meta/connection')
    if (!res.ok) throw new Error('שגיאה בטעינת חיבור Meta')
    const j = (await res.json()) as ConnPayload
    setData(j)
    const sel = j.accounts.find((a) => a.is_selected)
    if (sel) {
      setSelectedAccount(sel.ad_account_id)
      setPageId(sel.page_id ?? '')
    } else if (j.accounts[0]) {
      setSelectedAccount(j.accounts[0].ad_account_id)
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) setError(params.get('error'))
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [])

  async function connectMeta() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        '/api/mbrain/meta/oauth/start',
        { method: 'POST' },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { url?: string; error?: string; hintHe?: string }
      if (!res.ok || !j.url) throw new Error(j.error || j.hintHe || 'לא ניתן להתחיל OAuth')
      window.location.href = j.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setBusy(false)
    }
  }

  async function saveSelection() {
    setBusy(true)
    setError(null)
    try {
      const page = data?.discovery.pages?.find((p) => p.id === pageId)
      const res = await fetchWithTimeout(
        '/api/mbrain/meta/connection',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adAccountId: selectedAccount,
            pageId: pageId || null,
            pageName: page?.name ?? null,
            brandId: BAMAKOR_BRAND_ID,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const j = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'שמירה נכשלה')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BrainShell metaLabel={data?.meta.label}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">אינטגרציות</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">
            חבר את חשבון המודעות של Meta — זה מה שהופך את המערכת מסוכנות מדומה לסוכנות אמיתית.
          </p>
        </div>

        {error ? <p className="text-sm text-[var(--mbrain-bad)]">{error}</p> : null}

        <section className="mbrain-card space-y-3 p-5">
          <h3 className="text-lg text-white">סטטוס Meta</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--mbrain-muted)]">מצב</dt>
              <dd className="text-white">{data?.meta.mode ?? '…'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--mbrain-muted)]">חיבור</dt>
              <dd className="text-white">{data?.connection?.status ?? 'לא מחובר'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--mbrain-muted)]">APP_ID מוגדר</dt>
              <dd className="text-white">{data?.meta.appIdConfigured ? 'כן' : 'לא'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--mbrain-muted)]">הצפנת טוקן</dt>
              <dd className="text-white">{data?.meta.encryptionConfigured ? 'כן' : 'מפתח פיתוח'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--mbrain-muted)]">Graph API</dt>
              <dd className="text-white">{data?.meta.graphApiVersion}</dd>
            </div>
          </dl>
          {data?.connection?.lastError ? (
            <p className="text-xs text-[var(--mbrain-bad)]">{data.connection.lastError}</p>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void connectMeta()}
            className="rounded-xl bg-[var(--mbrain-accent)] px-4 py-2.5 text-sm text-white disabled:opacity-60"
          >
            {busy ? 'מעביר ל-Meta…' : 'חבר / רענן חיבור Meta'}
          </button>
          <p className="text-xs text-[var(--mbrain-muted)]">
            בפרודקשן הגדר גם <code className="text-white">META_MODE=live</code>. פרטים:{' '}
            <code className="text-white">docs/mbrain-credentials.md</code>
          </p>
        </section>

        <section className="mbrain-card space-y-4 p-5">
          <h3 className="text-lg text-white">בחירת חשבון מודעות + עמוד</h3>
          <label className="block text-sm text-[var(--mbrain-muted)]">
            Ad Account
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
            >
              <option value="">בחר…</option>
              {(data?.accounts ?? []).map((a) => (
                <option key={a.id} value={a.ad_account_id}>
                  {a.ad_account_name || a.ad_account_id}
                  {a.is_selected ? ' ★' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-[var(--mbrain-muted)]">
            Facebook Page
            <select
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
            >
              <option value="">בחר…</option>
              {(data?.discovery.pages ?? data?.accounts.map((a) => ({ id: a.page_id!, name: a.page_name || a.page_id! })).filter((p) => p.id) ?? []).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                )
              )}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !selectedAccount}
            onClick={() => void saveSelection()}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white disabled:opacity-60"
          >
            שמור בחירה
          </button>
        </section>

        <section className="mbrain-card space-y-3 p-5">
          <h3 className="text-lg text-white">AI (עלות מינימלית)</h3>
          <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--mbrain-muted)]">
            <li>
              ברירת מחדל: <code className="text-white">AI_PROVIDER=local</code>
            </li>
            <li>
              תמונות: <code className="text-white">IMAGE_PROVIDER=template</code> (+ sharp להעלאה ל-Meta)
            </li>
          </ul>
        </section>
      </div>
    </BrainShell>
  )
}
