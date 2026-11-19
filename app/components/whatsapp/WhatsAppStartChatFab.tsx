'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { whatsappUiFetch } from '@/lib/whatsapp-ui-fetch'
import { startWhatsAppConversation } from '@/lib/whatsapp-inbox-hooks'
import { toast } from '@/lib/error-handler'

type ResidentRow = {
  id: string
  full_name: string
  apartment_number: string | null
  phone: string
  building_name: string | null
}

type Props = {
  onStarted: (conversationId: string) => void
  buildingId?: string | null
  /** Controlled open from header "+" (optional). */
  forceOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

export function WhatsAppStartChatFab({
  onStarted,
  buildingId,
  forceOpen,
  onOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = forceOpen ?? internalOpen
  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange?.(next)
      if (forceOpen === undefined) setInternalOpen(next)
    },
    [forceOpen, onOpenChange]
  )
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ResidentRow[]>([])
  const [portalReady, setPortalReady] = useState(false)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  const search = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (query.trim().length >= 2) params.set('q', query.trim())
      if (buildingId) params.set('building_id', buildingId)
      const res = await whatsappUiFetch(`/api/whatsapp/residents-search?${params}`)
      const json = (await res.json()) as { residents?: ResidentRow[]; error?: string }
      if (!res.ok) throw new Error(json.error || 'חיפוש נכשל')
      setRows(json.residents ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'חיפוש נכשל')
    } finally {
      setLoading(false)
    }
  }, [buildingId, query])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => void search(), 280)
    return () => window.clearTimeout(t)
  }, [open, search])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  async function pickResident(residentId: string) {
    try {
      const conv = await startWhatsAppConversation(residentId)
      setOpen(false)
      onStarted(conv.id)
      toast.success('שיחה מוכנה — אפשר לשלוח הודעה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'יצירת שיחה נכשלה')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        style={styles.fab}
        aria-label="שיחה חדשה עם דייר"
        onClick={() => setOpen(true)}
      >
        <span style={styles.fabIcon}>+</span>
      </button>
    )
  }

  const sheet = (
    <div
      style={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="שיחה חדשה"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div style={styles.sheet}>
        <div style={styles.grab} aria-hidden />
        <StartChatHeader />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש דייר, דירה או טלפון"
          style={styles.input}
          autoFocus
        />
        <div style={styles.list}>
          {loading ? <p style={styles.hint}>מחפש…</p> : null}
          {!loading && rows.length === 0 ? (
            <p style={styles.hint}>הקלידו לפחות שני תווים או בחרו דייר מהרשימה</p>
          ) : null}
          {rows.map((r) => (
            <button key={r.id} type="button" style={styles.item} onClick={() => void pickResident(r.id)}>
              <span style={styles.itemTitle}>
                {r.full_name}
                {r.apartment_number ? ` · דירה ${r.apartment_number}` : ''}
              </span>
              <span style={styles.itemSub}>
                {[r.building_name, r.phone].filter(Boolean).join(' · ')}
              </span>
            </button>
          ))}
        </div>
        <button type="button" style={styles.closeBtn} onClick={() => setOpen(false)}>
          סגור
        </button>
      </div>
    </div>
  )

  if (!portalReady) return null
  return createPortal(sheet, document.body)
}

function StartChatHeader() {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111b21' }}>שיחה חדשה</h2>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#667781' }}>
        בחרו דייר מהבניין — בלי לחכות להודעה נכנסת.
      </p>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  fab: {
    position: 'absolute',
    left: 16,
    bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    width: 52,
    height: 52,
    borderRadius: '50%',
    border: 'none',
    background: '#00a884',
    color: '#fff',
    fontSize: 28,
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    zIndex: 2,
    touchAction: 'manipulation',
  },
  fabIcon: { display: 'block', marginTop: -2 },
  backdrop: {
    position: 'fixed',
    inset: 0,
    /* Above MobileBottomNav (z=130) so the sheet can dock to the real screen bottom. */
    zIndex: 140,
    background: 'rgba(17, 27, 33, 0.4)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    padding: 0,
    boxSizing: 'border-box',
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    marginInline: 'auto',
    background: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: '10px 16px 16px',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 'min(72dvh, 640px)',
    boxSizing: 'border-box',
    boxShadow: '0 -8px 28px rgba(0,0,0,0.12)',
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 999,
    background: '#d1d7db',
    alignSelf: 'center',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    border: '1px solid #e9edef',
    borderRadius: 8,
    padding: '12px',
    fontSize: 16,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  list: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minHeight: 48,
    flex: '1 1 auto',
    maxHeight: 'min(280px, 36dvh)',
    WebkitOverflowScrolling: 'touch',
  },
  item: {
    textAlign: 'right',
    border: '1px solid #f0f2f5',
    borderRadius: 8,
    padding: '12px',
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    touchAction: 'manipulation',
  },
  itemTitle: { display: 'block', fontWeight: 600, fontSize: 15, color: '#111b21' },
  itemSub: { display: 'block', fontSize: 12, color: '#667781', marginTop: 2 },
  hint: { margin: 0, fontSize: 13, color: '#667781', padding: '4px 2px' },
  closeBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 10,
    border: '1px solid #e9edef',
    background: '#f0f2f5',
    color: '#111b21',
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
}
