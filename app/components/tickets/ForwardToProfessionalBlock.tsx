'use client'

import { useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { TM } from '@/lib/toast-messages'
import { usePaidAddons } from '../PaidAddonsContext'
import { PAID_ADDON_KEYS, formatAddonPriceIls } from '@/lib/paid-addons'
import Link from 'next/link'

export type ProfessionalOption = {
  id: string
  full_name: string
  trade?: string | null
  phone?: string | null
  is_active: boolean
}

type Props = {
  ticketId: string
  professionals: ProfessionalOption[]
  onForwarded: () => void | Promise<void>
}

export function ForwardToProfessionalBlock({ ticketId, professionals, onForwarded }: Props) {
  const { hasAddon, getAddon, isBootstrapped } = usePaidAddons()
  const [professionalId, setProfessionalId] = useState('')
  const [note, setNote] = useState('')
  const [setEscort, setSetEscort] = useState(true)
  const [sending, setSending] = useState(false)

  const active = professionals.filter((p) => p.is_active)

  if (!isBootstrapped) {
    return null
  }

  if (!hasAddon(PAID_ADDON_KEYS.professionals)) {
    const addon = getAddon(PAID_ADDON_KEYS.professionals)
    return (
      <div style={styles.section}>
        <div style={styles.label}>העברה לאיש מקצוע</div>
        <p style={styles.hint}>
          תוסף בתשלום — {addon?.name_he || 'אנשי מקצוע'}{' '}
          ({formatAddonPriceIls(addon?.price_ils_monthly ?? 0)}/חודש).{' '}
          <Link href="/billing" style={styles.link}>
            לפרטים והפעלה
          </Link>
        </p>
      </div>
    )
  }

  async function handleForward() {
    if (!professionalId) {
      toast.error('בחרו איש מקצוע')
      return
    }
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/forward-ticket-to-professional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketId,
          professional_id: professionalId,
          note: note.trim() || null,
          set_status_escort: setEscort,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        sms_sent?: boolean
        sms_note?: string
      }
      if (!res.ok) {
        toast.error(json.error || 'העברה נכשלה')
        return
      }
      if (json.sms_sent) {
        toast.success(TM.ticketForwardedToProfessional)
      } else {
        toast.error(json.sms_note || 'שליחת SMS נכשלה')
      }
      setNote('')
      setProfessionalId('')
      await onForwarded()
    } catch {
      toast.error('שגיאת חיבור — נסו שוב')
    } finally {
      setSending(false)
    }
  }

  if (active.length === 0) {
    return (
      <div style={styles.section}>
        <div style={styles.label}>העברה לאיש מקצוע</div>
        <p style={styles.hint}>
          אין אנשי מקצוע פעילים. הוסיפו אנשי קשר בדף{' '}
          <a href="/professionals" style={styles.link}>
            אנשי מקצוע
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div style={styles.section}>
      <div style={styles.label}>העברה לאיש מקצוע (SMS)</div>
      <p style={styles.hint}>נשלח SMS עם פרטי התקלה. ניתן לעדכן סטטוס ל&quot;ליווי בעל מקצוע&quot;.</p>
      <select
        className="app-select-input"
        value={professionalId}
        onChange={(e) => setProfessionalId(e.target.value)}
        style={styles.select}
      >
        <option value="">בחרו איש מקצוע...</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
            {p.trade ? ` — ${p.trade}` : ''}
            {p.phone ? ` (${p.phone})` : ''}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="הערה ל-SMS (אופציונלי)"
        rows={2}
        style={styles.textarea}
      />
      <label style={styles.checkRow}>
        <input type="checkbox" checked={setEscort} onChange={(e) => setSetEscort(e.target.checked)} />
        <span>עדכון סטטוס ל&quot;ליווי בעל מקצוע&quot;</span>
      </label>
      <Button variant="secondary" loading={sending} onClick={() => void handleForward()} style={{ width: '100%' }}>
        שלח SMS לאיש המקצוע
      </Button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  hint: {
    margin: 0,
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
  },
  link: {
    color: theme.colors.primary,
    textDecoration: 'none',
    fontWeight: 600,
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '14px',
    fontFamily: 'inherit',
    background: theme.colors.surface,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
  },
}
