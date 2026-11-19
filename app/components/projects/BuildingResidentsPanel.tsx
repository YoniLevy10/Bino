'use client'

/**
 * Building Hub — דיירים tab (Wave 4).
 * Reuses residents directory + join link + intake share (no new schema).
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchResidentsPage, type ResidentListRow } from '@/lib/hooks/use-residents-list'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'
import { ProjectResidentJoinLink } from '@/app/components/projects/ProjectResidentJoinLink'
import { ProjectResidentIntakePanel } from '@/app/components/projects/ProjectResidentIntakePanel'
import { toast } from '@/lib/errors/error-handler'

type Props = {
  projectId: string
  projectName: string
  projectCode: string
  clientId: string
  isMobile?: boolean
}

const PREVIEW_LIMIT = 25

export function BuildingResidentsPanel({
  projectId,
  projectName,
  projectCode,
  clientId,
  isMobile: isMobileProp,
}: Props) {
  const tenant = useTenantClientId()
  const resolvedClientId = clientId || tenant.data || ''
  const [viewportMobile, setViewportMobile] = useState(false)
  const [rows, setRows] = useState<ResidentListRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof isMobileProp === 'boolean') return
    const check = () => setViewportMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isMobileProp])

  const isMobile = typeof isMobileProp === 'boolean' ? isMobileProp : viewportMobile

  const load = useCallback(async () => {
    if (!resolvedClientId) return
    setLoading(true)
    try {
      const page = await fetchResidentsPage(resolvedClientId, {
        projectId,
        offset: 0,
        limit: PREVIEW_LIMIT,
      })
      setRows(page.rows)
      setHasMore(page.hasMore)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת דיירים נכשלה')
      setRows([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [resolvedClientId, projectId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={styles.root}>
      <p style={styles.intro}>
        דיירים רשומים ל־<strong>{projectName}</strong> — פנקס, קישור אזור אישי, וסקר רישום.
      </p>

      <div style={styles.section}>
        <div
          style={{
            ...styles.sectionHeader,
            ...(isMobile ? styles.sectionHeaderMobile : null),
          }}
        >
          <h3 style={styles.sectionTitle}>בפנקס הדיירים</h3>
          <Button
            variant="secondary"
            size={isMobile ? 'md' : 'sm'}
            onClick={() => {
              window.location.href = `/residents?project=${encodeURIComponent(projectId)}`
            }}
            style={isMobile ? { minHeight: 44, width: '100%' } : undefined}
          >
            לכל הדיירים
          </Button>
        </div>

        {loading || tenant.isLoading ? (
          <div style={styles.center}>
            <LoadingSpinner size="sm" />
          </div>
        ) : rows.length === 0 ? (
          <p style={styles.empty}>אין דיירים רשומים לפרויקט זה עדיין</p>
        ) : (
          <div style={styles.list}>
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  ...styles.row,
                  ...(isMobile ? styles.rowMobile : null),
                }}
              >
                <span style={styles.name}>{r.full_name}</span>
                <span
                  style={{
                    ...styles.meta,
                    ...(isMobile ? styles.metaMobile : null),
                  }}
                >
                  {r.apartment_number ? `דירה ${r.apartment_number}` : '—'}
                  {r.phone ? ` · ${r.phone}` : ''}
                </span>
              </div>
            ))}
            {hasMore ? (
              <p style={styles.moreHint}>מוצגים {PREVIEW_LIMIT} ראשונים — המשיכו בדף הדיירים</p>
            ) : null}
          </div>
        )}
      </div>

      <ProjectResidentJoinLink projectId={projectId} projectName={projectName} />

      {resolvedClientId ? (
        <ProjectResidentIntakePanel
          projectCode={projectCode}
          clientId={resolvedClientId}
          projectName={projectName}
        />
      ) : null}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: theme.spacing.xl },
  intro: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  sectionTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  center: { display: 'flex', justifyContent: 'center', padding: 20 },
  empty: {
    margin: 0,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.sm,
    padding: '16px 0',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 12px',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    minHeight: 44,
    alignItems: 'center',
  },
  rowMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    padding: '12px 14px',
    minHeight: 52,
  },
  name: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
    wordBreak: 'break-word' as const,
    minWidth: 0,
  },
  meta: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    whiteSpace: 'nowrap',
  },
  metaMobile: {
    whiteSpace: 'normal',
    wordBreak: 'break-word' as const,
  },
  moreHint: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
}
