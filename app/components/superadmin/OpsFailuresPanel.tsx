'use client'

import type { CSSProperties } from 'react'
import { theme } from '../ui'

type FailedNotificationRow = {
  id: string
  client_name: string | null
  channel: string
  destination: string | null
  error_message: string
  created_at: string
}

type ErrorLogRow = {
  id: string
  client_name: string | null
  context: string
  message: string
  resolved: boolean
  whatsapp_attempts: number
  created_at: string
}

export type OpsFeed = {
  failed_notifications: FailedNotificationRow[]
  error_logs: ErrorLogRow[]
  counts: {
    failed_notifications: number
    error_logs: number
    unresolved_errors: number
  }
}

function formatOpsTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function truncateOps(text: string, max = 120): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

const thStyle: CSSProperties = {
  padding: '10px 14px',
  textAlign: 'right',
  fontSize: theme.typography.fontSize.xs,
  fontWeight: 600,
  color: theme.colors.textMuted,
  borderBottom: `1px solid ${theme.colors.border}`,
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '10px 14px',
  borderBottom: `1px solid ${theme.colors.border}`,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.textPrimary,
}

type Props = {
  opsFeed: OpsFeed | null
  opsLoading: boolean
  opsError: string
}

export function OpsFailuresPanel({ opsFeed, opsLoading, opsError }: Props) {
  return (
    <div>
      <h2 style={styles.sectionTitle}>כשלונות אחרונים (חי)</h2>
      <p style={styles.sectionLead}>
        נתונים מ-`failed_notifications` ו-`error_logs`. מייל ל-PLATFORM_OPS_EMAIL אם מוגדר Resend.
      </p>

      {opsError && (
        <div style={styles.errorBox}>{opsError}</div>
      )}

      {opsFeed && (
        <div style={styles.kpiRow}>
          {[
            { label: 'כשלי SMS/הודעות', value: opsFeed.counts.failed_notifications },
            { label: 'רשומות יומן שגיאות', value: opsFeed.counts.error_logs },
            { label: 'שגיאות פתוחות', value: opsFeed.counts.unresolved_errors },
          ].map((s) => (
            <div key={s.label} style={styles.kpi}>
              <div style={styles.kpiVal}>{s.value}</div>
              <div style={styles.kpiLbl}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>כשלי הודעות</h3>
        {opsLoading && !opsFeed ? (
          <p style={styles.muted}>טוען...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['זמן', 'לקוח', 'ערוץ', 'יעד', 'שגיאה'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(opsFeed?.failed_notifications ?? []).map((row) => (
                  <tr key={row.id}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: theme.typography.fontSize.xs }}>{formatOpsTime(row.created_at)}</td>
                    <td style={tdStyle}>{row.client_name ?? '—'}</td>
                    <td style={tdStyle}>{row.channel}</td>
                    <td style={{ ...tdStyle, direction: 'ltr', fontSize: theme.typography.fontSize.xs }}>{row.destination ?? '—'}</td>
                    <td style={{ ...tdStyle, maxWidth: 360 }} title={row.error_message}>{truncateOps(row.error_message, 160)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(opsFeed?.failed_notifications.length ?? 0) === 0 && !opsLoading && (
              <p style={styles.muted}>אין כשלונות אחרונים</p>
            )}
          </div>
        )}
      </div>

      <div style={{ ...styles.card, marginTop: 16 }}>
        <h3 style={styles.cardTitle}>יומן שגיאות תפעולי</h3>
        {opsLoading && !opsFeed ? (
          <p style={styles.muted}>טוען...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['זמן', 'לקוח', 'הקשר', 'סטטוס', 'הודעה'].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(opsFeed?.error_logs ?? []).map((row) => (
                  <tr key={row.id} style={{ opacity: row.resolved ? 0.65 : 1 }}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontSize: theme.typography.fontSize.xs }}>{formatOpsTime(row.created_at)}</td>
                    <td style={tdStyle}>{row.client_name ?? '—'}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs }}>{row.context}</td>
                    <td style={tdStyle}>
                      <span style={{
                        background: row.resolved ? theme.colors.successMuted : theme.colors.errorMuted,
                        color: row.resolved ? theme.colors.success : theme.colors.error,
                        borderRadius: theme.radius.xs,
                        padding: '2px 8px',
                        fontSize: theme.typography.fontSize.xs,
                        fontWeight: 600,
                      }}>
                        {row.resolved ? 'טופל' : 'פתוח'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 400 }} title={row.message}>
                      {truncateOps(row.message, 180)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(opsFeed?.error_logs.length ?? 0) === 0 && !opsLoading && (
              <p style={styles.muted}>אין שגיאות אחרונות</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  sectionTitle: {
    margin: '0 0 8px',
    fontSize: theme.typography.fontSize.lg,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  sectionLead: {
    margin: '0 0 20px',
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    lineHeight: 1.5,
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
  kpiRow: { display: 'flex', gap: theme.spacing.md, flexWrap: 'wrap', marginBottom: theme.spacing.lg },
  kpi: {
    background: theme.colors.warningMuted,
    borderRadius: theme.radius.md,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    textAlign: 'center',
    minWidth: 120,
  },
  kpiVal: { fontSize: theme.typography.fontSize['2xl'], fontWeight: 700, color: theme.colors.warning },
  kpiLbl: { fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted },
  card: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
  },
  cardTitle: { margin: '0 0 12px', fontSize: theme.typography.fontSize.base, fontWeight: 600 },
  muted: { color: theme.colors.textMuted, textAlign: 'center', padding: theme.spacing.lg, margin: 0 },
}
