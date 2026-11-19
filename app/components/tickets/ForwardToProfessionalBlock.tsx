'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/shared/fetch-with-timeout'
import { toast } from '@/lib/errors/error-handler'
import { TM } from '@/lib/toast-messages'
import { usePaidAddons } from '../PaidAddonsContext'
import { PAID_ADDON_KEYS } from '@/lib/addons/paid-addons'
import { ProfessionalRatingStars } from '@/app/components/professionals/ProfessionalRatingStars'
import { compareProfessionalsByOperationalMemory } from '@/lib/hooks/use-professionals-list'

export type ProfessionalOption = {
  id: string
  full_name: string
  trade?: string | null
  phone?: string | null
  is_active: boolean
  personal_rating?: number | null
  personal_note?: string | null
  use_count?: number | null
  last_contacted_at?: string | null
}

type Props = {
  ticketId: string
  professionals: ProfessionalOption[]
  onForwarded: () => void | Promise<void>
}

export function ForwardToProfessionalBlock({ ticketId, professionals, onForwarded }: Props) {
  const { hasAddon, isBootstrapped } = usePaidAddons()
  const [professionalId, setProfessionalId] = useState('')
  const [note, setNote] = useState('')
  const [setEscort, setSetEscort] = useState(true)
  const [sending, setSending] = useState(false)

  const active = useMemo(
    () =>
      professionals
        .filter((p) => p.is_active)
        .slice()
        .sort(compareProfessionalsByOperationalMemory),
    [professionals]
  )

  const selected = active.find((p) => p.id === professionalId) ?? null

  if (!isBootstrapped) {
    return null
  }

  if (!hasAddon(PAID_ADDON_KEYS.professionals)) {
    return null
  }

  async function handleForward() {
    if (!professionalId) {
      toast.error('בחרו איש מקצוע')
      return
    }
    setSending(true)
    try {
      const res = await fetchWithTimeout(
        '/api/forward-ticket-to-professional',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket_id: ticketId,
            professional_id: professionalId,
            note: note.trim() || null,
            set_status_escort: setEscort,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
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
      <div id="ticket-forward-professional" style={styles.section}>
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
    <div id="ticket-forward-professional" style={styles.section}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.label}>העברה לאיש מקצוע (SMS)</div>
          <p style={styles.hint}>ממוין לפי דירוג אישי ושימוש — בחרו ואשרו שליחה.</p>
        </div>
        <a href="/professionals" style={styles.link}>
          ניהול רשימה
        </a>
      </div>

      <div style={styles.pickerList} role="listbox" aria-label="בחירת איש מקצוע">
        {active.map((p) => {
          const selectedRow = p.id === professionalId
          const uses = p.use_count ?? 0
          return (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={selectedRow}
              onClick={() => setProfessionalId(p.id)}
              style={{
                ...styles.pickerCard,
                borderColor: selectedRow ? theme.colors.primary : theme.colors.border,
                background: selectedRow ? theme.colors.blueSoft : theme.colors.surface,
                boxShadow: selectedRow ? theme.shadows.sm : 'none',
              }}
            >
              <div style={styles.pickerTop}>
                <div style={styles.pickerName}>{p.full_name}</div>
                {selectedRow ? (
                  <span style={styles.selectedBadge}>נבחר</span>
                ) : null}
              </div>
              <div style={styles.pickerMeta}>
                {[p.trade, p.phone].filter(Boolean).join(' · ') || 'ללא תחום / טלפון'}
              </div>
              <div style={styles.pickerRatingRow}>
                <ProfessionalRatingStars rating={p.personal_rating} showEmptyLabel size="sm" />
                {uses > 0 ? (
                  <span style={styles.useChip}>{uses} העברות</span>
                ) : null}
              </div>
              {p.personal_note ? (
                <p style={styles.pickerNote}>{p.personal_note}</p>
              ) : null}
            </button>
          )
        })}
      </div>

      {selected ? (
        <div style={styles.selectedSummary}>
          <span style={styles.selectedSummaryLabel}>נבחר:</span>
          <strong>{selected.full_name}</strong>
          <ProfessionalRatingStars rating={selected.personal_rating} showEmptyLabel />
        </div>
      ) : null}

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
      <Button
        variant="primary"
        loading={sending}
        disabled={!professionalId}
        onClick={() => void handleForward()}
        style={{ width: '100%' }}
      >
        שלח SMS לאיש המקצוע
      </Button>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    background: theme.colors.muted,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.textMuted,
    letterSpacing: '0.04em',
  },
  hint: {
    margin: '4px 0 0',
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
  },
  link: {
    color: theme.colors.primary,
    textDecoration: 'none',
    fontWeight: 700,
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  pickerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: 280,
    overflowY: 'auto',
    padding: 2,
  },
  pickerCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    textAlign: 'right',
    width: '100%',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1.5px solid ${theme.colors.border}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  pickerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerName: {
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  selectedBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    borderRadius: theme.radius.full,
    padding: '2px 8px',
  },
  pickerMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  pickerRatingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  useChip: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.colors.textMuted,
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.full,
    padding: '2px 8px',
  },
  pickerNote: {
    margin: 0,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  selectedSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  selectedSummaryLabel: {
    fontWeight: 600,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
    background: theme.colors.surface,
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: theme.colors.textSecondary,
    cursor: 'pointer',
  },
}
