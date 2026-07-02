'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { theme } from '../components/ui'

type HealthPayload = {
  status: 'ok' | 'degraded' | 'error'
  summary_he?: string
  ts?: string
  issues?: string[]
  metrics?: {
    unresolved_media_errors_24h: number
    unresolved_ticket_create_errors_24h: number
    stuck_whatsapp_media_sessions: number
    whatsapp_clients_ok: number
    whatsapp_clients_total: number
  }
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'תקין',
  degraded: 'אזהרה',
  error: 'שגיאה',
}

const STATUS_COLOR: Record<string, string> = {
  ok: theme.colors.success,
  degraded: theme.colors.warning,
  error: theme.colors.error,
}

export default function HealthPage() {
  const [basic, setBasic] = useState<{ status?: string; db?: string } | null>(null)
  const [tickets, setTickets] = useState<HealthPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const [basicRes, ticketsRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/health/tickets'),
        ])
        setBasic((await basicRes.json()) as { status?: string; db?: string })
        setTickets((await ticketsRes.json()) as HealthPayload)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const overall =
    tickets?.status === 'error' || basic?.status === 'error'
      ? 'error'
      : tickets?.status === 'degraded'
        ? 'degraded'
        : 'ok'

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: theme.colors.background,
        padding: '32px 20px',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800 }}>בדיקת בריאות Bamakor</h1>
        <p style={{ margin: '0 0 24px', color: theme.colors.textMuted, lineHeight: 1.5 }}>
          מצב מערכת התקלות, תמונות ו-WhatsApp. מתעדכן בכל רענון. במקרה תקלה נשלח מייל אוטומטי לתפעול.
        </p>

        {loading ? (
          <p>טוען...</p>
        ) : (
          <>
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                border: `2px solid ${STATUS_COLOR[overall]}`,
                background: theme.colors.surface,
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 14, color: theme.colors.textMuted }}>סטטוס כללי</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: STATUS_COLOR[overall] }}>
                {STATUS_LABEL[overall]}
              </div>
              {tickets?.summary_he ? (
                <p style={{ margin: '8px 0 0', fontSize: 16 }}>{tickets.summary_he}</p>
              ) : null}
            </div>

            <section style={card}>
              <h2 style={sectionTitle}>תקלות ומדיה</h2>
              <Row label="סטטוס" value={STATUS_LABEL[tickets?.status || 'error']} />
              <Row label="כשלי מדיה (24ש)" value={String(tickets?.metrics?.unresolved_media_errors_24h ?? '—')} />
              <Row
                label="כשלי יצירת תקלה (24ש)"
                value={String(tickets?.metrics?.unresolved_ticket_create_errors_24h ?? '—')}
              />
              <Row
                label="מדיה תקועה ב-WhatsApp"
                value={String(tickets?.metrics?.stuck_whatsapp_media_sessions ?? '—')}
              />
              <Row
                label="WhatsApp לקוחות"
                value={`${tickets?.metrics?.whatsapp_clients_ok ?? 0}/${tickets?.metrics?.whatsapp_clients_total ?? 0} תקין`}
              />
              {tickets?.issues && tickets.issues.length > 0 ? (
                <ul style={{ margin: '12px 0 0', paddingRight: 20, color: theme.colors.error }}>
                  {tickets.issues.map((issue) => (
                    <li key={issue} style={{ marginBottom: 6 }}>
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: '12px 0 0', color: theme.colors.success }}>אין בעיות פתוחות</p>
              )}
            </section>

            <section style={card}>
              <h2 style={sectionTitle}>מסד נתונים</h2>
              <Row label="סטטוס" value={basic?.status === 'ok' ? 'תקין' : 'שגיאה'} />
              <Row label="חיבור DB" value={basic?.db || '—'} />
            </section>

            <p style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 24 }}>
              API:{' '}
              <a href="/api/health/tickets" style={{ color: theme.colors.primary }}>
                /api/health/tickets
              </a>
              {' · '}
              עדכון אחרון: {tickets?.ts ? new Date(tickets.ts).toLocaleString('he-IL') : '—'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <span style={{ color: theme.colors.textMuted }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  )
}

const card: CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  marginBottom: 16,
}

const sectionTitle: CSSProperties = {
  margin: '0 0 12px',
  fontSize: 16,
  fontWeight: 700,
}
