'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { whatsappUiFetch } from '@/lib/whatsapp-ui-fetch'
import { startWhatsAppConversation } from '@/lib/whatsapp-inbox-hooks'
import { toast } from '@/lib/error-handler'
import { Button } from '../ui'

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
}

export function WhatsAppStartChatFab({ onStarted, buildingId }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ResidentRow[]>([])

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

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label="שיחה חדשה">
      <div style={styles.sheet}>
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
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          סגור
        </Button>
      </div>
    </div>
  )
}

function StartChatHeader() {
  return (
    <div style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>שיחה חדשה</h2>
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
    position: 'absolute',
    inset: 0,
    background: 'rgba(17, 27, 33, 0.45)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 3,
    padding: 12,
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    borderRadius: 12,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 'min(80%, 70dvh)',
    boxSizing: 'border-box',
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
    minHeight: 120,
    maxHeight: 'min(320px, 42dvh)',
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
  hint: { margin: 0, fontSize: 13, color: '#667781', padding: 8 },
}