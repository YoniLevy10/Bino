'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import {
  FIXLY_CATEGORIES,
  inferCityFromAddress,
  isFixlyConfigured,
  mapBamakorPriorityToFixly,
  type FixlyPriority,
} from '@/lib/fixly'

type Props = {
  ticketId: string
  ticketDescription: string | null | undefined
  ticketPriority: string | null | undefined
  buildingName: string | null | undefined
  buildingAddress: string | null | undefined
  reporterPhone: string | null | undefined
  managerPhone: string | null | undefined
  disabled?: boolean
  onPublished: () => void | Promise<void>
}

export function PublishToFixlyButton(props: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [category, setCategory] = useState('general')
  const [priority, setPriority] = useState<FixlyPriority>('medium')
  const [notes, setNotes] = useState('')
  const [city, setCity] = useState('')
  const [managerPhone, setManagerPhone] = useState('')
  const [reporterPhone, setReporterPhone] = useState('')

  const configured = useMemo(() => {
    // Client cannot read secrets — show UI always; API returns 503 if env missing.
    // Hint only in success/error. Keep button available for ops that configured Vercel.
    return true
  }, [])

  useEffect(() => {
    if (!open) return
    setError(null)
    setSuccess(null)
    setNotes('')
    setCategory('general')
    setPriority(mapBamakorPriorityToFixly(props.ticketPriority))
    setCity(inferCityFromAddress(props.buildingAddress) || '')
    setManagerPhone(props.managerPhone?.trim() || '')
    setReporterPhone(props.reporterPhone?.trim() || '')
  }, [open, props.ticketPriority, props.buildingAddress, props.managerPhone, props.reporterPhone])

  async function handlePublish() {
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetchWithTimeout('/api/integrations/fixly/create-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: props.ticketId,
          category,
          priority,
          notes: notes.trim() || null,
          assignment_mode: 'broadcast_first_accept',
          city: city.trim() || null,
          manager_phone: managerPhone.trim() || null,
          reporter_phone: reporterPhone.trim() || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        detail?: string
        already_published?: boolean
        status?: string
        matched_providers?: number | null
      }
      if (!res.ok) {
        const msg =
          data.error === 'fixly_not_configured'
            ? 'Fixly לא מוגדר בסביבה (FIXLY_API_KEY / BAMAKOR_WEBHOOK_SECRET)'
            : data.detail || data.error || 'שגיאה בפרסום'
        setError(msg)
        return
      }
      if (data.already_published) {
        setSuccess(`כבר פורסם — סטטוס: ${data.status}`)
      } else {
        const n = data.matched_providers
        setSuccess(
          typeof n === 'number'
            ? `פורסם בהצלחה! נמצאו ${n} מקצוענים מתאימים`
            : 'פורסם בהצלחה ב-Fixly'
        )
      }
      toast.success('פורסם ב-Fixly')
      await props.onPublished()
    } catch {
      setError('שגיאת תקשורת')
    } finally {
      setLoading(false)
    }
  }

  if (!configured) return null

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={props.disabled}
        style={{ width: '100%' }}
      >
        פרסם ב-Fixly
      </Button>

      {open && (
        <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="פרסום ב-Fixly">
          <div style={styles.modal}>
            <h2 style={styles.title}>פרסום ב-Fixly</h2>

            {success ? (
              <div style={styles.stack}>
                <div style={styles.successBox}>{success}</div>
                <Button variant="secondary" onClick={() => setOpen(false)} style={{ width: '100%' }}>
                  סגור
                </Button>
              </div>
            ) : (
              <div style={styles.stack}>
                <div style={styles.readOnly}>
                  <Row label="בניין" value={props.buildingName || '—'} />
                  <Row label="כתובת" value={props.buildingAddress || '—'} />
                  <Row
                    label="תיאור"
                    value={(props.ticketDescription || '—').slice(0, 160)}
                  />
                </div>

                <label style={styles.label}>
                  קטגוריה
                  <select
                    className="app-select-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={styles.input}
                  >
                    {FIXLY_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.labelHe}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={styles.label}>
                  עדיפות
                  <select
                    className="app-select-input"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as FixlyPriority)}
                    style={styles.input}
                  >
                    <option value="low">נמוכה</option>
                    <option value="medium">רגילה</option>
                    <option value="high">גבוהה</option>
                    <option value="urgent">דחופה</option>
                  </select>
                </label>

                <label style={styles.label}>
                  עיר
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={styles.input}
                    placeholder="עיר לשיוך מקצוענים"
                  />
                </label>

                <label style={styles.label}>
                  טלפון מדווח
                  <input
                    value={reporterPhone}
                    onChange={(e) => setReporterPhone(e.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.label}>
                  טלפון מנהל
                  <input
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                    style={styles.input}
                  />
                </label>

                <label style={styles.label}>
                  הערות לקבלן (אופציונלי)
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="הערות נוספות לבעל המקצוע..."
                    style={{ ...styles.input, resize: 'vertical' as const }}
                  />
                </label>

                {error && <div style={styles.errorBox}>{error}</div>}

                <div style={styles.actions}>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    ביטול
                  </Button>
                  <Button variant="primary" loading={loading} onClick={() => void handlePublish()}>
                    פרסם ב-Fixly
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={styles.rowValue}>{value}</span>
    </div>
  )
}

// Silence unused import if tree-shaken oddly — keep helper available for tests/docs.
void isFixlyConfigured

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 80,
    padding: '16px',
  },
  modal: {
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '20px',
    direction: 'rtl',
  },
  title: {
    margin: '0 0 16px',
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  readOnly: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '13px',
  },
  rowLabel: { color: theme.colors.textMuted, flexShrink: 0 },
  rowValue: { color: theme.colors.textPrimary, fontWeight: 600, textAlign: 'left' as const },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  input: {
    width: '100%',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    padding: '10px 12px',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: theme.colors.textPrimary,
    background: theme.colors.surface,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  },
  successBox: {
    background: theme.colors.successMuted,
    color: theme.colors.success,
    borderRadius: theme.radius.md,
    padding: '12px',
    fontSize: '14px',
    fontWeight: 600,
  },
  errorBox: {
    background: theme.colors.errorMuted,
    color: theme.colors.error,
    borderRadius: theme.radius.md,
    padding: '10px 12px',
    fontSize: '13px',
  },
}
