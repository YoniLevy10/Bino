'use client'

import { useState, type CSSProperties } from 'react'
import { forwardFromInbox, type ForwardDryRunPreview } from '@/lib/whatsapp-inbox-hooks'
import { useActiveProfessionalsForAssign } from '@/lib/hooks/use-professionals-list'
import { toast } from '@/lib/error-handler'
import { Button } from '../ui'

type Props = {
  ticketId: string
  ticketNumber: number
}

export function WhatsAppInboxForwardPro({ ticketId, ticketNumber }: Props) {
  const { professionals, isLoading } = useActiveProfessionalsForAssign()
  const [expanded, setExpanded] = useState(false)
  const [professionalId, setProfessionalId] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<ForwardDryRunPreview | null>(null)
  const [busy, setBusy] = useState(false)

  async function runDryRun() {
    if (!professionalId) {
      toast.error('בחרו איש מקצוע')
      return
    }
    setBusy(true)
    try {
      const res = await forwardFromInbox({
        ticketId,
        professionalId,
        note: note.trim() || undefined,
        dryRun: true,
      })
      setPreview(res.preview ?? null)
      toast.success('תצוגה מקדימה מוכנה — אין שליחת SMS')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'תצוגה מקדימה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function sendForward() {
    if (!professionalId) {
      toast.error('בחרו איש מקצוע')
      return
    }
    setBusy(true)
    try {
      const res = await forwardFromInbox({
        ticketId,
        professionalId,
        note: note.trim() || undefined,
        dryRun: false,
      })
      if (res.sms_sent) {
        toast.success('התקלה הועברה לאיש המקצוע ב-SMS')
      } else {
        toast.error(res.sms_note || 'שליחת SMS נכשלה')
      }
      setPreview(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'העברה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  if (!expanded) {
    return (
      <div style={styles.collapsed}>
        <button type="button" style={styles.collapsedBtn} onClick={() => setExpanded(true)}>
          העברה לאיש מקצוע · תקלה #{ticketNumber}
        </button>
      </div>
    )
  }

  return (
    <div style={styles.box}>
      <div style={styles.titleRow}>
        <div style={styles.title}>העברה לאיש מקצוע · תקלה #{ticketNumber}</div>
        <button type="button" style={styles.collapseLink} onClick={() => setExpanded(false)}>
          סגור
        </button>
      </div>
      <label style={styles.label}>
        איש מקצוע
        <select
          value={professionalId}
          disabled={isLoading}
          onChange={(e) => {
            setProfessionalId(e.target.value)
            setPreview(null)
          }}
          style={styles.select}
        >
          <option value="">בחרו…</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {p.trade ? ` · ${p.trade}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label style={styles.label}>
        הערה (אופציונלי)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          style={styles.textarea}
        />
      </label>
      {preview ? (
        <div style={styles.preview}>
          <div style={styles.previewLabel}>תצוגה יבשה (dry-run)</div>
          <DryRunSmsBody text={preview.sms_body} />
          <DryRunMeta
            text={`${preview.professional_name} · ${preview.phones.length} מספרים`}
          />
        </div>
      ) : null}
      <div style={styles.actions}>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void runDryRun()}>
          {busy ? 'בודק…' : 'תצוגה מקדימה (dry-run)'}
        </Button>
        <Button type="button" disabled={busy || !preview} onClick={() => void sendForward()}>
          {busy ? 'שולח…' : 'שלח SMS לאיש מקצוע'}
        </Button>
      </div>
    </div>
  )
}

function DryRunSmsBody({ text }: { text: string }) {
  return (
    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.4 }}>{text}</pre>
  )
}

function DryRunMeta({ text }: { text: string }) {
  return <div style={{ marginTop: 6, fontSize: 11, color: '#667781' }}>{text}</div>
}

const styles: Record<string, CSSProperties> = {
  collapsed: {
    padding: '4px 0 8px',
  },
  collapsedBtn: {
    width: '100%',
    textAlign: 'right',
    border: '1px solid #e9edef',
    borderRadius: 8,
    background: '#f0f2f5',
    color: '#111b21',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    padding: '10px 12px',
    cursor: 'pointer',
  },
  box: {
    padding: '10px 12px',
    borderRadius: 8,
    background: '#fff',
    border: '1px solid #e9edef',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: '42dvh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { fontSize: 13, fontWeight: 700, color: '#111b21' },
  collapseLink: {
    border: 'none',
    background: 'transparent',
    color: '#027eb5',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
  },
  label: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 },
  select: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e9edef',
    fontFamily: 'inherit',
    fontSize: 16,
  },
  textarea: {
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #e9edef',
    fontFamily: 'inherit',
    fontSize: 16,
    resize: 'vertical',
  },
  preview: {
    padding: 10,
    borderRadius: 8,
    background: '#f0f2f5',
  },
  previewLabel: { fontSize: 11, fontWeight: 700, marginBottom: 6, color: '#54656f' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
}
