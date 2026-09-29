'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import type { LaunchCheckItem } from '@/lib/client-launch-checklist'
import type { ClientTask } from './types'

type LaunchPayload = {
  items: LaunchCheckItem[]
  doneCount: number
  totalCount: number
  readyForSoftLaunch: boolean
  email_slug: string | null
  resolved_email_slug: string | null
  email_from: string
  platform_notes: { title: string; detail: string }[]
  error?: string
}

export function ClientLaunchChecklistPanel({
  clientId,
  secret,
  onOpenTask,
}: {
  clientId: string
  secret: string
  onOpenTask: (task: ClientTask) => void
}) {
  const [data, setData] = useState<LaunchPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [slugDraft, setSlugDraft] = useState('')
  const [savingSlug, setSavingSlug] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/launch-status`, {
        headers: { 'x-admin-secret': secret },
      })
      const json = (await res.json()) as LaunchPayload
      if (!res.ok) throw new Error(json.error || 'טעינת צ׳קליסט נכשלה')
      setData(json)
      setSlugDraft(json.email_slug || json.resolved_email_slug || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [clientId, secret])

  useEffect(() => {
    void load()
  }, [load])

  async function saveSlug() {
    setSavingSlug(true)
    setError('')
    try {
      const res = await fetch(`/api/superadmin/client/${clientId}/launch-status`, {
        method: 'PATCH',
        headers: {
          'x-admin-secret': secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email_slug: slugDraft.trim() || null }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שמירת slug נכשלה')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSavingSlug(false)
    }
  }

  if (loading && !data) {
    return <p className="sa-hint">טוען צ׳קליסט הקמה…</p>
  }

  return (
    <div style={styles.wrap}>
      {error ? <p style={styles.err}>{error}</p> : null}

      {data ? (
        <>
          <div style={styles.summary}>
            <div>
              <div style={styles.summaryTitle}>
                {data.readyForSoftLaunch ? 'מוכן להשקה רכה' : 'חסרים פריטי ליבה'}
              </div>
              <div style={styles.summaryMeta}>
                {data.doneCount}/{data.totalCount} הושלמו
              </div>
            </div>
            <button type="button" className="sa-quick-btn" onClick={() => void load()}>
              רענון
            </button>
          </div>

          <div style={styles.emailBox}>
            <label className="sa-field">
              <span>Slug למייל Resend (@bino.casa)</span>
              <div style={styles.slugRow}>
                <input
                  className="sa-input"
                  value={slugDraft}
                  dir="ltr"
                  placeholder="bamakor"
                  onChange={(e) => setSlugDraft(e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={styles.atDomain}>@bino.casa</span>
              </div>
            </label>
            <p className="sa-hint" style={{ marginTop: 6 }}>
              נשלח כ־{data.email_from}
            </p>
            <LoadingButton
              onClick={() => void saveSlug()}
              loading={savingSlug}
              loadingText="שומר…"
              style={{ marginTop: 8 }}
            >
              שמור slug
            </LoadingButton>
          </div>

          <ul style={styles.list}>
            {data.items.map((item) => (
              <li key={item.id} style={styles.item}>
                <span
                  style={{
                    ...styles.dot,
                    background:
                      item.status === 'ok'
                        ? '#16a34a'
                        : item.status === 'external'
                          ? '#d97706'
                          : '#94a3b8',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.itemTitle}>{item.title}</div>
                  <div style={styles.itemDetail}>{item.detail}</div>
                  {item.hrefHint &&
                  item.hrefHint !== 'launch' &&
                  item.status !== 'ok' ? (
                    <button
                      type="button"
                      className="sa-link"
                      style={{ marginTop: 4, border: 'none', background: 'none', padding: 0 }}
                      onClick={() => onOpenTask(item.hrefHint as ClientTask)}
                    >
                      פתח בסופר-אדמין
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="sa-quick-btn"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => setShowGuide((v) => !v)}
          >
            {showGuide ? 'הסתר מדריך פלטפורמה' : 'מדריך: מה משותף / מה פר-לקוח'}
          </button>

          {showGuide ? (
            <div style={styles.guide}>
              {data.platform_notes.map((n) => (
                <div key={n.title} style={styles.guideBlock}>
                  <div style={styles.itemTitle}>{n.title}</div>
                  <div style={styles.itemDetail}>{n.detail}</div>
                </div>
              ))}
              <p className="sa-hint" style={{ marginTop: 8 }}>
                מדריך מלא: docs/CLIENT_LAUNCH.md
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  summary: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 12,
    background: '#f1f5f9',
  },
  summaryTitle: { fontWeight: 800, fontSize: 16, color: theme.colors.textPrimary },
  summaryMeta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  emailBox: {
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
  },
  slugRow: { display: 'flex', alignItems: 'center', gap: 8 },
  atDomain: { fontSize: 13, color: theme.colors.textMuted, fontFamily: 'monospace' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  item: {
    display: 'flex',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  dot: { width: 10, height: 10, borderRadius: 99, marginTop: 5, flexShrink: 0 },
  itemTitle: { fontWeight: 700, fontSize: 14, color: theme.colors.textPrimary },
  itemDetail: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 1.45, marginTop: 2 },
  guide: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    background: '#fffbeb',
    border: '1px solid #fde68a',
  },
  guideBlock: { paddingBottom: 8, borderBottom: '1px solid #fde68a' },
  err: { color: theme.colors.error, margin: 0, fontSize: 13 },
}
