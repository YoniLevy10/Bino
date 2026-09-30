'use client'

import { useMemo, useState } from 'react'
import {
  SANDBOX_AMENITIES,
  SANDBOX_ANNOUNCEMENTS,
  SANDBOX_CHARGES,
  SANDBOX_DOCUMENTS,
  SANDBOX_RESIDENT,
  SANDBOX_TICKETS,
} from '@/lib/resident-portal/sandbox-fixtures'
import { residentMidragSearchHref, residentMidragSectors } from '@/lib/resident-portal/midrag'

type Tab = 'home' | 'payments' | 'tickets' | 'info'

const SECTORS = residentMidragSectors()

export default function ResidentSandboxPage() {
  const [tab, setTab] = useState<Tab>('home')
  const [payToast, setPayToast] = useState('')
  const [tickets, setTickets] = useState(SANDBOX_TICKETS)
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketScope, setTicketScope] = useState<'common' | 'private' | 'unclear'>('common')
  const [sectorId, setSectorId] = useState<number>(SECTORS[0]?.sectorId ?? 4)

  const openBalance = useMemo(
    () => SANDBOX_CHARGES.filter((c) => c.can_pay).reduce((sum, c) => sum + c.amount, 0),
    []
  )
  const nextCharge = SANDBOX_CHARGES.find((c) => c.can_pay) || null
  const pinned = SANDBOX_ANNOUNCEMENTS.find((a) => a.is_pinned) || SANDBOX_ANNOUNCEMENTS[0]
  const midrag = residentMidragSearchHref({ sectorId, city: SANDBOX_RESIDENT.city })

  function fakePay() {
    setPayToast('Sandbox: תשלום לא בוצע באמת — זה רק הדגמה של המסך.')
    window.setTimeout(() => setPayToast(''), 4000)
  }

  function openTicket() {
    const desc = ticketDesc.trim()
    if (!desc) return
    const next = {
      id: `sb-t-${Date.now()}`,
      ticket_number: 1043 + tickets.length,
      status: 'OPEN',
      scope: ticketScope,
      description: desc,
      opened_at: new Date().toISOString(),
    }
    setTickets((prev) => [next, ...prev])
    setTicketDesc('')
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#F2F4F8',
        color: '#1A1A2E',
        fontFamily: 'var(--font-heebo), sans-serif',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: '#fff',
          borderBottom: '1px solid #E8E8ED',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#007AFF',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
          }}
        >
          B
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{SANDBOX_RESIDENT.clientName}</div>
          <div style={{ fontSize: 13, color: '#86868B' }}>
            {SANDBOX_RESIDENT.projectName} · דירה {SANDBOX_RESIDENT.apartment}
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#B45309',
            background: '#FEF3C7',
            borderRadius: 999,
            padding: '6px 10px',
          }}
        >
          SANDBOX
        </span>
      </header>

      <div
        style={{
          padding: '10px 16px',
          background: '#E5F2FF',
          borderBottom: '1px solid #BFDBFE',
          fontSize: 13,
        }}
      >
        מחובר כ־<strong>{SANDBOX_RESIDENT.fullName}</strong> · {SANDBOX_RESIDENT.phone} · נתוני הדגמה
        בלבד (ללא DB / OTP / תשלום אמיתי)
      </div>

      <main style={{ flex: 1, padding: '16px 16px 96px', maxWidth: 560, width: '100%', margin: '0 auto' }}>
        {tab === 'home' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={card}>
              <div style={{ fontSize: 13, color: '#86868B' }}>יתרה לתשלום</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                ₪{openBalance.toLocaleString('he-IL')}
              </div>
              {nextCharge ? (
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  החיוב הקרוב: {nextCharge.title} · עד {nextCharge.due_date}
                </div>
              ) : null}
              <button type="button" onClick={() => setTab('payments')} style={linkBtn}>
                לתשלומים
              </button>
            </section>

            <section style={card}>
              <h2 style={h2}>הודעה</h2>
              <div style={{ fontWeight: 700 }}>{pinned.title}</div>
              <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#3C3C43' }}>
                {pinned.body}
              </p>
            </section>

            <section style={card}>
              <h2 style={h2}>שעות מתקנים להיום</h2>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {SANDBOX_AMENITIES.map((a) => (
                  <li key={a.id} style={{ marginBottom: 6 }}>
                    <strong>{a.name}</strong>:{' '}
                    {a.today.is_closed ? 'סגור' : `${a.today.opens_at}–${a.today.closes_at}`}
                  </li>
                ))}
              </ul>
            </section>

            <button type="button" onClick={() => setTab('tickets')} style={{ ...linkBtn, background: '#1A1A2E' }}>
              פתיחת תקלה
            </button>
          </div>
        ) : null}

        {tab === 'payments' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>התשלומים שלי</h1>
            <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E8E8ED' }}>
              יתרה פתוחה: <strong>₪{openBalance.toLocaleString('he-IL')}</strong>
            </div>
            {payToast ? (
              <div role="status" style={{ background: '#FEF3C7', padding: 12, borderRadius: 12 }}>
                {payToast}
              </div>
            ) : null}
            {SANDBOX_CHARGES.map((c) => (
              <article
                key={c.id}
                style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E8E8ED' }}
              >
                <div style={{ fontWeight: 700 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: '#86868B', marginTop: 4 }}>
                  {c.period_label}
                  {c.due_date ? ` · פירעון ${c.due_date}` : ''}
                  {c.is_overdue ? ' · באיחור' : ''}
                </div>
                <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>
                  ₪{c.amount.toLocaleString('he-IL')}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  סטטוס: {c.status === 'paid' ? 'שולם' : 'ממתין לתשלום'}
                </div>
                {c.invoice.available && c.invoice.url ? (
                  <a
                    href={c.invoice.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-block', marginTop: 8 }}
                  >
                    מסמך כספי / חשבונית (PDF לדוגמה)
                  </a>
                ) : null}
                {c.can_pay ? (
                  <button type="button" onClick={fakePay} style={{ ...linkBtn, width: '100%' }}>
                    תשלום מאובטח (הדגמה)
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {tab === 'tickets' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>תקלות</h1>
            <section style={card}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>תיאור</label>
              <textarea
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  fontSize: 16,
                  borderRadius: 10,
                  border: '1px solid #D1D1D6',
                  padding: 12,
                  resize: 'vertical',
                }}
                placeholder="למשל: נזילה בלובי…"
              />
              <label style={{ fontSize: 13, display: 'block', margin: '10px 0 4px' }}>סוג</label>
              <select
                value={ticketScope}
                onChange={(e) => setTicketScope(e.target.value as typeof ticketScope)}
                style={{ width: '100%', minHeight: 44, fontSize: 16, marginBottom: 12 }}
              >
                <option value="common">רכוש משותף</option>
                <option value="private">דירה פרטית</option>
                <option value="unclear">לא בטוח</option>
              </select>
              <button type="button" onClick={openTicket} style={{ ...linkBtn, width: '100%', marginTop: 0 }}>
                פתיחת קריאה (Sandbox)
              </button>
            </section>
            {tickets.map((t) => (
              <article key={t.id} style={card}>
                <div style={{ fontWeight: 700 }}>#{t.ticket_number}</div>
                <div style={{ fontSize: 13, color: '#86868B' }}>
                  {t.status} · {t.scope}
                </div>
                <p style={{ margin: '8px 0 0' }}>{t.description}</p>
              </article>
            ))}
          </div>
        ) : null}

        {tab === 'info' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <h1 style={{ margin: 0, fontSize: 22 }}>מידע הבניין</h1>

            <section style={card}>
              <h2 style={h2}>הודעות</h2>
              {SANDBOX_ANNOUNCEMENTS.map((a) => (
                <div key={a.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {a.title}
                    {a.is_pinned ? ' · נעוץ' : ''}
                  </div>
                  <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{a.body}</p>
                </div>
              ))}
            </section>

            <section style={card}>
              <h2 style={h2}>מסמכים</h2>
              {SANDBOX_DOCUMENTS.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'right',
                    background: '#F5F5F7',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                    minHeight: 44,
                    fontSize: 15,
                    color: '#1A1A2E',
                    textDecoration: 'none',
                  }}
                >
                  {d.file_name}
                  {d.category ? ` · ${d.category}` : ''}
                </a>
              ))}
            </section>

            <section style={card}>
              <h2 style={h2}>מתקנים</h2>
              {SANDBOX_AMENITIES.map((a) => (
                <div key={a.id} style={{ marginBottom: 10 }}>
                  <strong>{a.name}</strong>
                  <div style={{ fontSize: 14 }}>
                    היום: {a.today.is_closed ? 'סגור' : `${a.today.opens_at}–${a.today.closes_at}`}
                  </div>
                  <div style={{ fontSize: 13, color: '#86868B', marginTop: 4 }}>{a.guidelines}</div>
                </div>
              ))}
            </section>

            <section style={card}>
              <h2 style={h2}>פרטי קשר</h2>
              <div>טלפון: {SANDBOX_RESIDENT.contactPhone}</div>
              <div>דוא״ל: {SANDBOX_RESIDENT.contactEmail}</div>
            </section>

            <section style={card}>
              <h2 style={h2}>חיפוש בעל מקצוע במידרג</h2>
              <select
                value={sectorId}
                onChange={(e) => setSectorId(Number(e.target.value))}
                style={{ width: '100%', minHeight: 44, marginBottom: 8, fontSize: 16 }}
              >
                {SECTORS.map((s) => (
                  <option key={s.sectorId} value={s.sectorId}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 13, marginBottom: 8 }}>עיר: {SANDBOX_RESIDENT.city}</div>
              {midrag.href ? (
                <a href={midrag.href} target="_blank" rel="noopener noreferrer" style={linkBtn}>
                  חיפוש במידרג
                </a>
              ) : null}
            </section>
          </div>
        ) : null}
      </main>

      <nav
        aria-label="ניווט Sandbox"
        style={{
          position: 'fixed',
          bottom: 0,
          insetInline: 0,
          background: '#fff',
          borderTop: '1px solid #E8E8ED',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          zIndex: 30,
        }}
      >
        {(
          [
            { id: 'home', label: 'בית' },
            { id: 'payments', label: 'תשלומים' },
            { id: 'tickets', label: 'תקלות' },
            { id: 'info', label: 'מידע' },
          ] as const
        ).map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              style={{
                border: 'none',
                background: 'transparent',
                textAlign: 'center',
                padding: '10px 4px',
                minHeight: 56,
                color: active ? '#007AFF' : '#86868B',
                fontWeight: active ? 700 : 500,
                fontSize: 13,
              }}
            >
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 16,
  border: '1px solid #E8E8ED',
}
const h2: React.CSSProperties = { fontSize: 16, margin: '0 0 8px' }
const linkBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 12,
  minHeight: 48,
  padding: '0 16px',
  borderRadius: 12,
  background: '#007AFF',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
  border: 'none',
  fontSize: 16,
  cursor: 'pointer',
}
