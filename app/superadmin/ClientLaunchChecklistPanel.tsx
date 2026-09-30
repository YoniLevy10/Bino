'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import type { LaunchCheckItem } from '@/lib/client-launch-checklist'
import type { ClientTask } from './types'

type PlaybookStep = { step: number; title: string; detail: string }

type SmokeCheck = { id: string; title: string; detail: string }

type LaunchPayload = {
  items: LaunchCheckItem[]
  doneCount: number
  totalCount: number
  readyForSoftLaunch: boolean
  email_slug: string | null
  resolved_email_slug: string | null
  email_from: string
  playbook?: PlaybookStep[]
  live_smoke?: SmokeCheck[]
  platform_notes: { title: string; detail: string }[]
  error?: string
}

function stepDone(items: LaunchCheckItem[], step: number): boolean {
  const inStep = items.filter((i) => i.step === step)
  if (inStep.length === 0) return false
  return inStep.every((i) => i.status === 'ok')
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

  const playbook = data?.playbook ?? []

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
                {data.doneCount}/{data.totalCount} הושלמו · עקבו לפי הסדר למטה
              </div>
            </div>
            <button type="button" className="sa-quick-btn" onClick={() => void load()}>
              רענון
            </button>
          </div>

          {playbook.length > 0 ? (
            <div style={styles.playbook}>
              <div style={styles.playbookIntro}>
                סדר פעולה בזמן אמת (אל תדלגו / אל תערבבו)
              </div>
              <ol style={styles.playbookList}>
                {playbook.map((p) => {
                  const done = stepDone(data.items, p.step)
                  return (
                    <li key={p.step} style={styles.playbookItem}>
                      <span
                        style={{
                          ...styles.stepBadge,
                          background: done ? '#16a34a' : '#1e293b',
                        }}
                      >
                        {p.step}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.playbookTitle}>
                          {p.title}
                          {done ? (
                            <span style={styles.doneTag}> ✓</span>
                          ) : null}
                        </div>
                        <div style={styles.playbookDetail}>{p.detail}</div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}

          <div style={styles.emailBox}>
            <label className="sa-field">
              <span>Slug למייל Resend (@bino.casa) — שלב 6</span>
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

          {(data.live_smoke?.length ?? 0) > 0 ? (
            <div style={styles.smokeBox}>
              <div style={styles.sectionLabel}>שלב 7 — בדיקות חיות (ידני, בזמן טסטים)</div>
              <ol style={styles.smokeList}>
                {data.live_smoke!.map((s, idx) => (
                  <li key={s.id} style={styles.smokeItem}>
                    <span style={styles.smokeNum}>{idx + 1}</span>
                    <div>
                      <div style={styles.itemTitle}>{s.title}</div>
                      <div style={styles.itemDetail}>{s.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="sa-hint" style={{ marginTop: 8 }}>
                מדריך מלא: docs/CLIENT_SOFT_LAUNCH_SMOKE.md
              </p>
            </div>
          ) : null}

          <div style={styles.sectionLabel}>פירוט סטטוס לפי שלב</div>
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
  playbook: {
    margin: 0,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    borderRadius: 12,
    background: '#0f172a',
    color: '#f8fafc',
  },
  playbookList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  playbookIntro: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: '#94a3b8',
  },
  playbookItem: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 13,
    color: '#fff',
    flexShrink: 0,
  },
  doneTag: { color: '#4ade80', fontWeight: 800 },
  playbookTitle: { fontWeight: 700, fontSize: 14, color: '#f8fafc' },
  playbookDetail: { fontSize: 12, color: '#cbd5e1', lineHeight: 1.45, marginTop: 2 },
  emailBox: {
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
  },
  slugRow: { display: 'flex', alignItems: 'center', gap: 8 },
  atDomain: { fontSize: 13, color: theme.colors.textMuted, fontFamily: 'monospace' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  smokeBox: {
    padding: 12,
    borderRadius: 12,
    border: '1px solid #fde68a',
    background: '#fffbeb',
  },
  smokeList: {
    listStyle: 'none',
    margin: '8px 0 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  smokeItem: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  smokeNum: {
    width: 22,
    height: 22,
    borderRadius: 6,
    background: '#b45309',
    color: '#fff',
    fontSize: 12,
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
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
