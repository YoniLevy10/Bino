'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { PlatformDocSection } from '@/app/api/superadmin/docs/route'
import { MarkdownDoc } from './MarkdownDoc'
import { OpsFailuresPanel, type OpsFeed } from './OpsFailuresPanel'
import { theme } from '../ui'

const LIVE_OPS_SECTION_ID = '__live_ops__'

type Props = {
  adminSecret: string
}

export function PlatformDocsPanel({ adminSecret }: Props) {
  const [sections, setSections] = useState<PlatformDocSection[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState('')
  const [activeId, setActiveId] = useState<string>('platform')

  const [opsFeed, setOpsFeed] = useState<OpsFeed | null>(null)
  const [opsLoading, setOpsLoading] = useState(false)
  const [opsError, setOpsError] = useState('')

  const loadDocs = useCallback(async () => {
    setDocsLoading(true)
    setDocsError('')
    try {
      const res = await fetch('/api/superadmin/docs', { headers: { 'x-admin-secret': adminSecret } })
      const json = await res.json() as { sections?: PlatformDocSection[]; error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      const list = json.sections ?? []
      setSections(list)
      if (list.length) {
        setActiveId((prev) =>
          prev === LIVE_OPS_SECTION_ID || list.some((s) => s.id === prev) ? prev : list[0].id
        )
      }
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : 'טעינת תיעוד נכשלה')
    } finally {
      setDocsLoading(false)
    }
  }, [adminSecret])

  const loadOpsFeed = useCallback(async () => {
    setOpsLoading(true)
    setOpsError('')
    try {
      const res = await fetch('/api/superadmin/ops-feed?limit=50', {
        headers: { 'x-admin-secret': adminSecret },
      })
      const json = await res.json() as OpsFeed & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setOpsFeed({
        failed_notifications: json.failed_notifications ?? [],
        error_logs: json.error_logs ?? [],
        counts: json.counts ?? {
          failed_notifications: 0,
          error_logs: 0,
          unresolved_errors: 0,
        },
      })
    } catch (e) {
      setOpsError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setOpsLoading(false)
    }
  }, [adminSecret])

  useEffect(() => {
    void loadDocs()
  }, [loadDocs])

  useEffect(() => {
    if (activeId === LIVE_OPS_SECTION_ID) void loadOpsFeed()
  }, [activeId, loadOpsFeed])

  const navItems = useMemo(() => {
    const byCategory = new Map<string, PlatformDocSection[]>()
    for (const s of sections) {
      const list = byCategory.get(s.category) ?? []
      list.push(s)
      byCategory.set(s.category, list)
    }
    return { byCategory, ops: { id: LIVE_OPS_SECTION_ID, title: 'כשלונות אחרונים', category: 'תפעול' } }
  }, [sections])

  const activeSection = sections.find((s) => s.id === activeId)

  function refreshAll() {
    void loadDocs()
    if (activeId === LIVE_OPS_SECTION_ID) void loadOpsFeed()
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <p style={styles.toolbarText}>
          תיעוד פנימי לפיתוח והתפתחות המוצר — מקור: קבצי Markdown במאגר (`docs/`, צ&apos;קליסטים).
        </p>
        <button
          type="button"
          onClick={refreshAll}
          disabled={docsLoading || opsLoading}
          style={styles.refreshBtn}
        >
          {docsLoading || opsLoading ? 'טוען...' : 'רענן תיעוד'}
        </button>
      </div>

      {docsError && <div style={styles.errorBox}>{docsError}</div>}

      <div style={styles.layout}>
        <nav style={styles.sidebar}>
          {Array.from(navItems.byCategory.entries()).map(([category, items]) => (
            <div key={category} style={styles.navGroup}>
              <div style={styles.navCategory}>{category}</div>
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  style={{
                    ...styles.navBtn,
                    ...(activeId === item.id ? styles.navBtnActive : {}),
                  }}
                >
                  {item.title}
                </button>
              ))}
            </div>
          ))}
          <div style={styles.navGroup}>
            <div style={styles.navCategory}>{navItems.ops.category}</div>
            <button
              type="button"
              onClick={() => setActiveId(LIVE_OPS_SECTION_ID)}
              style={{
                ...styles.navBtn,
                ...(activeId === LIVE_OPS_SECTION_ID ? styles.navBtnActive : {}),
              }}
            >
              {navItems.ops.title}
            </button>
          </div>
        </nav>

        <main style={styles.main}>
          {docsLoading && !sections.length ? (
            <p style={styles.muted}>טוען תיעוד...</p>
          ) : activeId === LIVE_OPS_SECTION_ID ? (
            <OpsFailuresPanel opsFeed={opsFeed} opsLoading={opsLoading} opsError={opsError} />
          ) : activeSection ? (
            <MarkdownDoc source={activeSection.content} />
          ) : (
            <p style={styles.muted}>בחרו מסמך מהתפריט</p>
          )}
        </main>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    flexWrap: 'wrap',
  },
  toolbarText: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
    lineHeight: 1.5,
    maxWidth: 640,
  },
  refreshBtn: {
    background: theme.colors.surface,
    border: `1.5px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    flexShrink: 0,
  },
  errorBox: {
    background: theme.colors.errorMuted,
    border: `1.5px solid ${theme.colors.error}`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    color: theme.colors.error,
    fontSize: theme.typography.fontSize.sm,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 240px) 1fr',
    gap: theme.spacing.xl,
    alignItems: 'start',
  },
  sidebar: {
    position: 'sticky',
    top: 16,
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    maxHeight: 'calc(100vh - 200px)',
    overflowY: 'auto',
  },
  navGroup: { marginBottom: theme.spacing.md },
  navCategory: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: theme.colors.textMuted,
    marginBottom: 6,
    paddingInline: 8,
  },
  navBtn: {
    display: 'block',
    width: '100%',
    textAlign: 'right',
    padding: '8px 10px',
    marginBottom: 2,
    border: 'none',
    borderRadius: theme.radius.md,
    background: 'transparent',
    cursor: 'pointer',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  navBtnActive: {
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontWeight: 600,
  },
  main: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '24px 28px',
    minHeight: 400,
  },
  muted: { color: theme.colors.textMuted, textAlign: 'center', padding: 24 },
}
