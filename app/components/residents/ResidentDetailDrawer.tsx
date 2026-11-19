'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Drawer, Button, LoadingSpinner, StatusBadge, theme } from '@/app/components/ui'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { fetchWithTimeout, DEFAULT_FETCH_TIMEOUT_MS } from '@/lib/shared/fetch-with-timeout'
import {
  COLLECTION_CHARGE_STATUS_COLORS,
  COLLECTION_CHARGE_STATUS_LABELS,
  formatChargeAmountIls,
  type CollectionChargeListItem,
  type CollectionChargeStatus,
} from '@/lib/collections/collection-charges'
import { formatReporterPhoneForDisplay, normalizeReporterPhone } from '@/lib/reporter/reporter-display'
import { ticketDetailPath } from '@/lib/tickets/ticket-deep-link'
import { ticketStatusLabelHe } from '@/lib/tickets/ticket-status'
import { toast } from '@/lib/errors/error-handler'

const RECENT_TICKETS_LIMIT = 8
const RECENT_CHARGES_LIMIT = 5

export type ResidentDetailRow = {
  id: string
  project_id: string
  client_id?: string | null
  full_name: string
  phone: string | null
  email?: string | null
  is_renter?: boolean
  apartment_number: string | null
  notes?: string | null
}

type RecentTicket = {
  id: string
  ticket_number: number
  status: string
  description: string | null
  opened_at: string
}

type Props = {
  open: boolean
  resident: ResidentDetailRow | null
  projectName: string
  tenantClientId: string | null
  isMobile: boolean
  onClose: () => void
  onEdit: () => void
}

function waMeUrl(phone: string): string | null {
  const digits = normalizeReporterPhone(phone)
  if (!digits || digits.length < 9) return null
  return `https://wa.me/${digits}`
}

function formatOpenedHe(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return ''
  }
}

export function ResidentDetailDrawer({
  open,
  resident,
  projectName,
  tenantClientId,
  isMobile,
  onClose,
  onEdit,
}: Props) {
  const router = useRouter()
  const [ticketsLoading, setTicketsLoading] = useState(false)
  const [chargesLoading, setChargesLoading] = useState(false)
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([])
  const [recentCharges, setRecentCharges] = useState<CollectionChargeListItem[]>([])
  const [ticketsError, setTicketsError] = useState(false)
  const [chargesSkipped, setChargesSkipped] = useState(false)

  const phoneDisplay = resident?.phone ? formatReporterPhoneForDisplay(resident.phone) : ''
  const waUrl = resident?.phone ? waMeUrl(resident.phone) : null

  const collectionsHref = useMemo(() => {
    if (!resident) return '/collections'
    const params = new URLSearchParams()
    if (resident.project_id) params.set('project_id', resident.project_id)
    const q = resident.full_name.trim().slice(0, 80)
    if (q) params.set('q', q)
    const qs = params.toString()
    return qs ? `/collections?${qs}` : '/collections'
  }, [resident])

  useEffect(() => {
    if (!open || !resident) {
      setRecentTickets([])
      setRecentCharges([])
      setTicketsError(false)
      setChargesSkipped(false)
      return
    }

    let cancelled = false
    setTicketsLoading(true)
    setTicketsError(false)
    setRecentTickets([])

    void (async () => {
      try {
        const clientId =
          (resident.client_id || tenantClientId || '').trim() ||
          (await resolveBinoClientIdForBrowser())
        const phone = resident.phone?.trim() || ''
        const normalized = phone ? normalizeReporterPhone(phone) : ''

        let query = withClientId(
          supabase
            .from('tickets')
            .select('id, ticket_number, status, description, opened_at')
            .eq('project_id', resident.project_id)
            .is('deleted_at', null)
            .order('opened_at', { ascending: false })
            .limit(RECENT_TICKETS_LIMIT),
          clientId
        )

        if (normalized) {
          query = query.eq('normalized_phone', normalized)
        }

        const { data, error } = await query
        if (cancelled) return
        if (error) {
          setTicketsError(true)
          setRecentTickets([])
        } else {
          setRecentTickets((data || []) as RecentTicket[])
        }
      } catch {
        if (!cancelled) {
          setTicketsError(true)
          setRecentTickets([])
        }
      } finally {
        if (!cancelled) setTicketsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, resident, tenantClientId])

  useEffect(() => {
    if (!open || !resident) {
      setRecentCharges([])
      setChargesSkipped(false)
      return
    }

    let cancelled = false
    setChargesLoading(true)
    setRecentCharges([])
    setChargesSkipped(false)

    void (async () => {
      try {
        const params = new URLSearchParams({
          project_id: resident.project_id,
          page: '1',
          page_size: String(RECENT_CHARGES_LIMIT),
          q: resident.full_name.trim().slice(0, 80),
        })
        const res = await fetchWithTimeout(
          `/api/collections/charges?${params.toString()}`,
          {},
          DEFAULT_FETCH_TIMEOUT_MS
        )
        if (cancelled) return
        if (res.status === 403 || res.status === 402) {
          setChargesSkipped(true)
          setRecentCharges([])
          return
        }
        const json = (await res.json().catch(() => ({}))) as {
          items?: CollectionChargeListItem[]
          error?: string
        }
        if (!res.ok) {
          setChargesSkipped(true)
          setRecentCharges([])
          return
        }
        const items = (json.items || []).filter((c) => c.resident_id === resident.id)
        setRecentCharges(items.slice(0, RECENT_CHARGES_LIMIT))
      } catch {
        if (!cancelled) {
          setChargesSkipped(true)
          setRecentCharges([])
        }
      } finally {
        if (!cancelled) setChargesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, resident])

  function copyPhone() {
    const raw = resident?.phone?.trim()
    if (!raw) return
    void navigator.clipboard
      .writeText(raw)
      .then(() => toast.success('טלפון הועתק'))
      .catch(() => toast.error('ההעתקה נכשלה'))
  }

  function openTicket(ticketId: string) {
    router.push(ticketDetailPath(ticketId))
    onClose()
  }

  if (!resident) return null

  const subtitleParts = [
    projectName || 'בניין',
    resident.apartment_number ? `דירה ${resident.apartment_number}` : null,
  ].filter(Boolean)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={resident.full_name}
      subtitle={subtitleParts.join(' · ')}
      isMobile={isMobile}
      placement="center"
      footer={
        <div style={styles.footerActions}>
          <Button variant="secondary" type="button" onClick={onClose}>
            סגור
          </Button>
          <Button variant="secondary" type="button" onClick={onEdit}>
            עריכת פרטים
          </Button>
        </div>
      }
    >
      <div style={styles.body}>
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>זיהוי</h3>
          <dl style={styles.dl}>
            <div style={styles.row}>
              <dt style={styles.dt}>שם</dt>
              <dd style={styles.dd}>
                {resident.full_name}
                {resident.is_renter ? (
                  <span style={styles.renterBadge}>שוכר</span>
                ) : null}
              </dd>
            </div>
            <div style={styles.row}>
              <dt style={styles.dt}>טלפון</dt>
              <dd style={styles.dd}>
                {resident.phone ? (
                  <span style={styles.phoneRow}>
                    <button
                      type="button"
                      onClick={copyPhone}
                      style={styles.phoneBtn}
                      title="העתקה"
                    >
                      {phoneDisplay || resident.phone}
                    </button>
                    {waUrl ? (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={styles.waLink}
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            {resident.email ? (
              <div style={styles.row}>
                <dt style={styles.dt}>אימייל</dt>
                <dd style={{ ...styles.dd, direction: 'ltr', textAlign: 'end' as const }}>
                  {resident.email}
                </dd>
              </div>
            ) : null}
            <div style={styles.row}>
              <dt style={styles.dt}>בניין</dt>
              <dd style={styles.dd}>{projectName || '—'}</dd>
            </div>
            <div style={styles.row}>
              <dt style={styles.dt}>דירה</dt>
              <dd style={styles.dd}>{resident.apartment_number || '—'}</dd>
            </div>
          </dl>
          {resident.notes ? (
            <p style={styles.notes}>{resident.notes}</p>
          ) : null}
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <h3 style={styles.sectionTitle}>תקלות אחרונות</h3>
            {resident.phone ? (
              <Link
                href={`/tickets?project=${encodeURIComponent(resident.project_id)}`}
                style={styles.inlineLink}
                onClick={onClose}
              >
                כל התקלות בבניין
              </Link>
            ) : null}
          </div>
          {ticketsLoading ? (
            <div style={styles.centered}>
              <LoadingSpinner />
            </div>
          ) : ticketsError ? (
            <p style={styles.muted}>לא הצלחנו לטעון תקלות.</p>
          ) : recentTickets.length === 0 ? (
            <p style={styles.muted}>
              {resident.phone
                ? 'אין תקלות אחרונות לטלפון הזה בבניין.'
                : 'אין טלפון — לא ניתן לשייך תקלות.'}
            </p>
          ) : (
            <ul style={styles.list}>
              {recentTickets.map((t) => (
                <li key={t.id}>
                  <button type="button" style={styles.ticketBtn} onClick={() => openTicket(t.id)}>
                    <span style={styles.ticketMain}>
                      <strong>#{t.ticket_number}</strong>
                      <span style={styles.ticketDesc}>
                        {(t.description || '').trim().slice(0, 72) ||
                          'ללא תיאור'}
                      </span>
                    </span>
                    <span style={styles.ticketMeta}>
                      <StatusBadge status={t.status} size="sm" />
                      <span style={styles.ticketStatusText}>
                        {ticketStatusLabelHe(t.status)}
                      </span>
                      {t.opened_at ? (
                        <span style={styles.ticketDate}>{formatOpenedHe(t.opened_at)}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <h3 style={styles.sectionTitle}>גבייה</h3>
            <Link href={collectionsHref} style={styles.inlineLink} onClick={onClose}>
              לוח גבייה
            </Link>
          </div>
          {chargesLoading ? (
            <div style={styles.centered}>
              <LoadingSpinner />
            </div>
          ) : chargesSkipped ? (
            <p style={styles.muted}>מודול הגבייה לא פעיל או שאין הרשאה.</p>
          ) : recentCharges.length === 0 ? (
            <p style={styles.muted}>אין חיובים אחרונים לדייר.</p>
          ) : (
            <ul style={styles.list}>
              {recentCharges.map((c) => {
                const status = c.status as CollectionChargeStatus
                const color =
                  COLLECTION_CHARGE_STATUS_COLORS[status] || theme.colors.textMuted
                return (
                  <li key={c.id} style={styles.chargeRow}>
                    <div style={styles.chargeMain}>
                      <span style={styles.chargeTitle}>{c.title || 'חיוב'}</span>
                      <span style={styles.chargeAmount}>{formatChargeAmountIls(c.amount)}</span>
                    </div>
                    <span style={{ ...styles.chargeStatus, color }}>
                      {COLLECTION_CHARGE_STATUS_LABELS[status] || c.status}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  )
}

const styles: Record<string, CSSProperties> = {
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  section: {
    borderTop: `1px solid ${theme.colors.border}`,
    paddingTop: '16px',
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '10px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  dl: { margin: 0 },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '16px',
    margin: '0 0 10px',
    alignItems: 'flex-start',
  },
  dt: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    flexShrink: 0,
  },
  dd: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textPrimary,
    textAlign: 'start',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  renterBadge: {
    background: theme.colors.warningMuted,
    color: theme.colors.warning,
    border: `1px solid ${theme.colors.warning}`,
    borderRadius: theme.radius.sm,
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
  },
  phoneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  phoneBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.primary,
    fontFamily: 'inherit',
    fontSize: '14px',
    padding: 0,
    direction: 'ltr',
  },
  waLink: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.success,
    textDecoration: 'none',
  },
  notes: {
    margin: '12px 0 0',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.mutedSurface,
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  inlineLink: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ticketBtn: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '6px',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'start',
  },
  ticketMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: theme.colors.textPrimary,
    fontSize: '14px',
  },
  ticketDesc: {
    color: theme.colors.textSecondary,
    fontSize: '13px',
    lineHeight: 1.4,
  },
  ticketMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexWrap: 'wrap',
  },
  ticketDate: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  ticketStatusText: {
    fontSize: '12px',
    color: theme.colors.textSecondary,
  },
  chargeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.mutedSurface,
  },
  chargeMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  chargeTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  chargeAmount: {
    fontSize: '13px',
    color: theme.colors.textSecondary,
  },
  chargeStatus: {
    fontSize: '12px',
    fontWeight: 600,
    flexShrink: 0,
  },
  muted: {
    margin: 0,
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  centered: {
    display: 'flex',
    justifyContent: 'center',
    padding: '16px 0',
  },
  footerActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
  },
}