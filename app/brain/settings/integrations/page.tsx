'use client'

import { useEffect, useState } from 'react'
import { BrainShell } from '../../components/BrainShell'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

export default function IntegrationsPage() {
  const [meta, setMeta] = useState<{ mode: string; label: string; graphApiVersion: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetchWithTimeout('/api/mbrain/dashboard')
      if (res.ok) {
        const j = (await res.json()) as { meta: { mode: string; label: string; graphApiVersion: string } }
        setMeta(j.meta)
      }
    })()
  }, [])

  return (
    <BrainShell metaLabel={meta?.label}>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-semibold text-white">אינטגרציות</h2>
          <p className="mt-1 text-sm text-[var(--mbrain-muted)]">Meta, AI מקומי, וספקי תמונות — הכל בצד שרת בלבד.</p>
        </div>

        <section className="mbrain-card space-y-3 p-5">
          <h3 className="text-lg text-white">Meta Marketing API</h3>
          <p className="text-sm text-[var(--mbrain-muted)]">
            מצב נוכחי:{' '}
            <strong className="text-white">{meta?.mode ?? '…'}</strong> · גרסת Graph:{' '}
            <strong className="text-white">{meta?.graphApiVersion ?? '…'}</strong>
          </p>
          <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--mbrain-muted)]">
            <li>
              הגדר <code className="text-white">META_APP_ID</code> / <code className="text-white">META_APP_SECRET</code>
            </li>
            <li>
              <code className="text-white">META_MODE=live</code> לפרודקשן · <code className="text-white">mock</code> לפיתוח
            </li>
            <li>
              <code className="text-white">META_GRAPH_API_VERSION</code> (ברירת מחדל v21.0)
            </li>
            <li>
              פרטים מלאים: <code className="text-white">docs/mbrain-credentials.md</code>
            </li>
          </ul>
          <p className="text-xs text-amber-200/90">
            OAuth לחיבור Business / Ad Account / Page יתווסף ב-Phase D. האדפטר כבר תומך במבנה live.
          </p>
        </section>

        <section className="mbrain-card space-y-3 p-5">
          <h3 className="text-lg text-white">AI (עלות מינימלית)</h3>
          <ul className="list-disc space-y-1 pr-5 text-sm text-[var(--mbrain-muted)]">
            <li>
              ברירת מחדל: <code className="text-white">AI_PROVIDER=local</code> + Ollama/llama.cpp
            </li>
            <li>
              <code className="text-white">LOCAL_AI_BASE_URL</code> · <code className="text-white">LOCAL_AI_MODEL</code>
            </li>
            <li>
              תמונות: <code className="text-white">IMAGE_PROVIDER=template</code> (חינמי) לפני מודלים בתשלום
            </li>
          </ul>
        </section>
      </div>
    </BrainShell>
  )
}
