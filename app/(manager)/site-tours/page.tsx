'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Button,
  Card,
  EmptyState,
  KpiCard,
  KpiRow,
  LoadingSpinner,
  MobileHeader,
  PageHeader,
  SearchInput,
  Select,
  theme,
  useMobileMenu,
} from '@/app/components/ui'
import { ActionConfirmSheet } from '@/app/components/ui/ActionConfirmSheet'
import { toast } from '@/lib/errors/error-handler'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { useSiteTours, type SiteTourRow } from '@/lib/hooks/use-site-tours'

type ChipFilter = 'all' | 'worker_notes' | 'defect' | 'needs_manager'

function formatTourWhen(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function startOfDaysAgo(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d
}

export default function SiteToursPage() {
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()
  const {
    tours,
    isLoading,
    error,
    hasData,
    updateManagerNotes,
    isUpdatingNotes,
    deleteTour,
    isDeletingTour,
  } = useSiteTours()

  const [search, setSearch] = useState('')
  const [buildingId, setBuildingId] = useState('all')
  const [chip, setChip] = useState<ChipFilter>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SiteTourRow | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (error) toast.error(error instanceof Error ? error.message : 'טעינת סיורים נכשלה')
  }, [error])

  const buildingOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tours) {
      if (t.project_id && t.project_name) map.set(t.project_id, t.project_name)
    }
    return [
      { value: 'all', label: 'כל הבניינים' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'he'))
        .map(([value, label]) => ({ value, label })),
    ]
  }, [tours])

  const kpis = useMemo(() => {
    const weekStart = startOfDaysAgo(7)
    const weekTours = tours.filter((t) => new Date(t.completed_at) >= weekStart)
    const buildings = new Set(weekTours.map((t) => t.project_id).filter(Boolean))
    const withWorkerNotes = tours.filter((t) => Boolean(t.notes?.trim())).length
    const withDefect = tours.filter((t) => Boolean(t.defect_ticket_id)).length
    return {
      week: weekTours.length,
      buildings: buildings.size,
      withWorkerNotes,
      withDefect,
    }
  }, [tours])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tours.filter((t) => {
      if (buildingId !== 'all' && t.project_id !== buildingId) return false
      if (chip === 'worker_notes' && !t.notes?.trim()) return false
      if (chip === 'defect' && !t.defect_ticket_id) return false
      if (chip === 'needs_manager' && t.manager_notes?.trim()) return false
      if (!q) return true
      const hay = [
        t.project_name,
        t.project_address || '',
        t.worker_name,
        t.notes || '',
        t.manager_notes || '',
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [tours, buildingId, chip, search])

  function startEdit(tour: SiteTourRow) {
    setEditingId(tour.id)
    setDraftNotes(tour.manager_notes || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setDraftNotes('')
  }

  async function saveManagerNotes(tourId: string) {
    setSavingId(tourId)
    try {
      const value = draftNotes.trim() || null
      await updateManagerNotes(tourId, value)
      toast.success('הערת מנהל נשמרה')
      setEditingId(null)
      setDraftNotes('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSavingId(null)
    }
  }

  async function confirmDeleteTour() {
    if (!deleteTarget) return
    try {
      await deleteTour(deleteTarget.id)
      if (editingId === deleteTarget.id) {
        setEditingId(null)
        setDraftNotes('')
      }
      toast.success('הסיור נמחק')
      setDeleteTarget(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'מחיקה נכשלה')
    }
  }

  const showSpinner = isLoading && !hasData

  return (
    <>
      {isMobile && (
        <MobileHeader title="סיורים" subtitle="היסטוריה מהשטח" onMenuClick={openMenu} />
      )}
      <div style={styles.wrap(isMobile)}>
        {!isMobile && (
          <PageHeader
            title="סיורים"
            subtitle="זיכרון תפעולי מהשטח — הערות עובד, תמונות, ליקויים והערות מנהל"
          />
        )}

        <KpiRow columns={4} isMobile={isMobile} style={{ marginBottom: 4 }}>
          <KpiCard label="סיורים ב־7 ימים" value={showSpinner ? '—' : kpis.week} accent="primary" />
          <KpiCard label="בניינים שסוירו" value={showSpinner ? '—' : kpis.buildings} />
          <KpiCard label="עם הערת עובד" value={showSpinner ? '—' : kpis.withWorkerNotes} />
          <KpiCard
            label="עם ליקוי"
            value={showSpinner ? '—' : kpis.withDefect}
            accent={kpis.withDefect > 0 ? 'warning' : undefined}
          />
        </KpiRow>

        <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="חיפוש בניין, עובד או הערה"
            style={{ flex: 1, minWidth: isMobile ? '100%' : 220 }}
          />
          <Select
            value={buildingId}
            onChange={setBuildingId}
            options={buildingOptions}
            style={{ width: isMobile ? '100%' : 220 }}
          />
        </div>

        <div style={styles.chips} role="group" aria-label="סינון מהיר">
          {(
            [
              { id: 'all', label: 'הכל' },
              { id: 'worker_notes', label: 'עם הערת עובד' },
              { id: 'defect', label: 'עם ליקוי' },
              { id: 'needs_manager', label: 'ממתין להערת מנהל' },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChip(c.id)}
              style={{
                ...styles.chip,
                ...(chip === c.id ? styles.chipActive : null),
              }}
              aria-pressed={chip === c.id}
            >
              {c.label}
            </button>
          ))}
        </div>

        {showSpinner ? (
          <LoadingSpinner />
        ) : tours.length === 0 ? (
          <EmptyState
            title="עדיין אין סיורים"
            description="כשעובד רושם סיור מפורטל העובדים (הערה, תמונה או ליקוי), הוא יופיע כאן."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="אין תוצאות"
            description="נסו לשנות חיפוש או סינון."
            action={{ label: 'נקה סינון', onClick: () => { setSearch(''); setBuildingId('all'); setChip('all') } }}
          />
        ) : (
          <div style={styles.list}>
            {filtered.map((t) => {
              const editing = editingId === t.id
              const saving = savingId === t.id
              return (
                <Card key={t.id}>
                  <div style={styles.cardTop}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.title}>{t.project_name || 'בניין'}</div>
                      <div style={styles.meta}>
                        {t.worker_name || 'עובד'} · {formatTourWhen(t.completed_at)}
                        {t.project_address ? ` · ${t.project_address}` : ''}
                      </div>
                    </div>
                    {t.defect_ticket_id ? (
                      <span style={styles.badgeDefect}>ליקוי</span>
                    ) : null}
                  </div>

                  <div style={styles.block}>
                    <div style={styles.blockLabel}>הערת עובד</div>
                    {t.notes?.trim() ? (
                      <p style={styles.notes}>{t.notes}</p>
                    ) : (
                      <p style={styles.mutedNote}>העובד לא הוסיף הערה</p>
                    )}
                  </div>

                  <div style={styles.block}>
                    <div style={styles.blockHeader}>
                      <div style={styles.blockLabel}>הערת מנהל</div>
                      {!editing ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => startEdit(t)}
                        >
                          {t.manager_notes?.trim() ? 'עריכה' : 'הוספת הערה'}
                        </Button>
                      ) : null}
                    </div>
                    {editing ? (
                      <div style={styles.editBox}>
                        <textarea
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          placeholder="מה צריך לעקוב אחרי הסיור?"
                          rows={3}
                          maxLength={2000}
                          style={styles.textarea}
                          disabled={saving || isUpdatingNotes}
                        />
                        <div style={styles.editActions}>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            ביטול
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={() => void saveManagerNotes(t.id)}
                            disabled={saving || isUpdatingNotes}
                          >
                            {saving ? 'שומר…' : 'שמירה'}
                          </Button>
                        </div>
                      </div>
                    ) : t.manager_notes?.trim() ? (
                      <>
                        <p style={styles.notes}>{t.manager_notes}</p>
                        {t.manager_notes_updated_at ? (
                          <div style={styles.updatedAt}>
                            עודכן {formatTourWhen(t.manager_notes_updated_at)}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p style={styles.mutedNote}>אין עדיין הערת מנהל</p>
                    )}
                  </div>

                  {t.photos && t.photos.length > 0 ? (
                    <div style={styles.photos}>
                      {t.photos.map((ph, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a
                          key={`${t.id}-${idx}`}
                          href={ph.public_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img src={ph.public_url} alt="" style={styles.thumb} />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {t.defect_ticket_id ? (
                    <a href={`/tickets?ticket=${t.defect_ticket_id}`} style={styles.link}>
                      פתיחת תקלת ליקוי מהסיור
                    </a>
                  ) : null}

                  <div style={styles.cardFooter}>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTarget(t)}
                      disabled={isDeletingTour}
                    >
                      מחיקת סיור
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <ActionConfirmSheet
        open={Boolean(deleteTarget)}
        isMobile={isMobile}
        title="למחוק את הסיור?"
        body={
          deleteTarget
            ? `הסיור ב${deleteTarget.project_name || 'בניין'} מ־${formatTourWhen(deleteTarget.completed_at)} יימחק לצמיתות, כולל תמונות. תקלת ליקוי (אם נפתחה) לא תימחק.`
            : undefined
        }
        confirmLabel={isDeletingTour ? 'מוחק…' : 'מחיקה'}
        confirmVariant="danger"
        loading={isDeletingTour}
        onConfirm={() => void confirmDeleteTour()}
        onCancel={() => {
          if (!isDeletingTour) setDeleteTarget(null)
        }}
      />
    </>
  )
}

const styles = {
  wrap: (mobile: boolean): CSSProperties => ({
    padding: mobile ? '16px 16px 32px' : '32px 40px',
    maxWidth: mobile ? '100%' : 1400,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  }),
  filters: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    alignItems: 'stretch' as const,
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  chip: {
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    borderRadius: theme.radius.full,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chipActive: {
    background: 'rgba(37, 99, 235, 0.12)',
    borderColor: 'rgba(37, 99, 235, 0.35)',
    color: theme.colors.primary,
  },
  list: { display: 'flex', flexDirection: 'column' as const, gap: 12, minWidth: 0 },
  cardTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontWeight: 700,
    fontSize: 16,
    color: theme.colors.textPrimary,
    wordBreak: 'break-word' as const,
  },
  meta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    wordBreak: 'break-word' as const,
    lineHeight: 1.4,
  },
  badgeDefect: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.warning,
    background: 'rgba(217, 119, 6, 0.12)',
    borderRadius: theme.radius.full,
    padding: '4px 10px',
  },
  block: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: `1px solid ${theme.colors.border}`,
  },
  blockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  blockLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.textMuted,
    letterSpacing: '0.02em',
  },
  notes: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.45,
    color: theme.colors.textPrimary,
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
  },
  mutedNote: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  updatedAt: {
    marginTop: 6,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  editBox: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  textarea: {
    width: '100%',
    boxSizing: 'border-box' as const,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.inputBorder}`,
    background: theme.colors.inputBackground,
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: theme.colors.textPrimary,
    resize: 'vertical' as const,
    minHeight: 84,
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  photos: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginTop: 12 },
  thumb: {
    width: 72,
    height: 72,
    objectFit: 'cover' as const,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    display: 'block',
  },
  link: {
    display: 'inline-block',
    marginTop: 12,
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 14,
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: `1px solid ${theme.colors.border}`,
    display: 'flex',
    justifyContent: 'flex-start',
  },
}
