'use client'

import { FormEvent, useMemo, useState } from 'react'
import {
  SANDBOX_AMENITIES,
  SANDBOX_ANNOUNCEMENTS,
  SANDBOX_CHARGES,
  SANDBOX_DOCUMENTS,
  SANDBOX_RESIDENT,
  SANDBOX_TICKETS,
} from '@/lib/resident-portal/sandbox-fixtures'
import { handleSandboxBotTurn } from '@/lib/resident-portal/sandbox-bot'
import {
  RESIDENT_BOT_QUICK_PROMPTS,
  residentBotVisibleActions,
  type ResidentBotAction,
} from '@/lib/resident-portal/bot-ui'
import { residentMidragSearchHref, residentMidragSectors } from '@/lib/resident-portal/midrag'
import {
  ResidentAlert,
  ResidentAmbientWash,
  ResidentCard,
  ResidentDocumentPreviewButton,
  ResidentField,
  ResidentMuted,
  ResidentNavIcon,
  ResidentPageTitle,
  ResidentPrimaryButton,
  ResidentSectionTitle,
  ResidentSelect,
  ResidentTextArea,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

type Tab = 'home' | 'payments' | 'tickets' | 'info' | 'chat'
type ChatMsg = { role: 'user' | 'assistant'; content: string }

const SECTORS = residentMidragSectors()

export default function ResidentSandboxPage() {
  const [tab, setTab] = useState<Tab>('home')
  const [payToast, setPayToast] = useState('')
  const [tickets, setTickets] = useState(SANDBOX_TICKETS)
  const [ticketDesc, setTicketDesc] = useState('')
  const [ticketScope, setTicketScope] = useState<'common' | 'private' | 'unclear'>('common')
  const [sectorId, setSectorId] = useState<number>(SECTORS[0]?.sectorId ?? 4)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        'Sandbox: שלום! שאלו על תקלה, תשלומים, הודעות או שעות מתקנים. כפתור הבוט פותח את המסך הזה.',
    },
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatPending, setChatPending] = useState<{ message: string; scope: string } | null>(null)
  const [chatActions, setChatActions] = useState<ResidentBotAction[]>([])

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

  function runSandboxBot(message: string, confirmCreate = false, scope?: string | null) {
    const turn = handleSandboxBotTurn({ message, confirmCreate, scope })
    setChatMessages((prev) => [...prev, { role: 'assistant', content: turn.reply }])
    const visible = residentBotVisibleActions(turn.actions)
    const confirm = visible.find((a) => a.type === 'create_ticket' && a.payload)
    if (confirmCreate) {
      setChatPending(null)
      const next = {
        id: `sb-t-bot-${Date.now()}`,
        ticket_number: 1043 + tickets.length,
        status: 'OPEN',
        scope: scope || 'unclear',
        description: message,
        opened_at: new Date().toISOString(),
      }
      setTickets((prev) => [next, ...prev])
    } else if (confirm?.payload) {
      setChatPending({
        message: confirm.payload.message || message,
        scope: confirm.payload.scope || 'unclear',
      })
    } else {
      setChatPending(null)
    }
    setChatActions(visible.filter((a) => a.href && !(a.type === 'create_ticket' && a.payload)))
  }

  function onChatSubmit(e: FormEvent) {
    e.preventDefault()
    const message = chatInput.trim()
    if (!message) return
    setChatMessages((prev) => [...prev, { role: 'user', content: message }])
    setChatInput('')
    runSandboxBot(message)
  }

  function followSandboxAction(href: string) {
    if (href === '#payments') setTab('payments')
    else if (href === '#tickets') setTab('tickets')
  }

  return (
    <div className="resident-shell" style={residentShellStyles.root} dir="rtl">
      <ResidentAmbientWash />

      <header className="lg-chrome" style={residentShellStyles.header}>
        <div style={residentShellStyles.logoMark}>B</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={residentShellStyles.title}>{SANDBOX_RESIDENT.clientName}</div>
          <div style={residentShellStyles.subtitle}>
            {SANDBOX_RESIDENT.projectName} · דירה {SANDBOX_RESIDENT.apartment}
          </div>
        </div>
        <span
          className="lg-chip lg-chip-active"
          style={{
            ...residentShellStyles.chip,
            color: residentTheme.colors.warning,
            background: residentTheme.colors.warningMuted,
            border: `0.5px solid ${residentTheme.colors.warning}`,
          }}
        >
          SANDBOX
        </span>
      </header>

      <div
        className="lg-glass"
        style={{
          margin: '8px 16px 0',
          padding: '10px 14px',
          borderRadius: residentTheme.radius.lg,
          fontSize: residentTheme.typography.fontSize.sm,
          color: residentTheme.colors.textSecondary,
        }}
      >
        מחובר כ־<strong style={{ color: residentTheme.colors.textPrimary }}>{SANDBOX_RESIDENT.fullName}</strong>
        {' · '}
        {SANDBOX_RESIDENT.phone}
        {' · '}
        נתוני הדגמה בלבד
      </div>

      <main style={residentShellStyles.main}>
        {tab === 'home' ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <ResidentCard>
              <div style={{ fontSize: 13, color: residentTheme.colors.textMuted }}>יתרה לתשלום</div>
              <div style={residentShellStyles.balanceValue}>₪{openBalance.toLocaleString('he-IL')}</div>
              {nextCharge ? (
                <div style={{ marginTop: 8, fontSize: 14, color: residentTheme.colors.textSecondary }}>
                  החיוב הקרוב: {nextCharge.title} · עד {nextCharge.due_date}
                </div>
              ) : null}
              <div style={{ marginTop: 12 }}>
                <ResidentPrimaryButton onClick={() => setTab('payments')}>לתשלומים</ResidentPrimaryButton>
              </div>
            </ResidentCard>

            <ResidentCard>
              <ResidentSectionTitle>הודעה</ResidentSectionTitle>
              <div style={{ fontWeight: 700 }}>{pinned.title}</div>
              <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: residentTheme.colors.textSecondary }}>
                {pinned.body}
              </p>
            </ResidentCard>

            <ResidentCard>
              <ResidentSectionTitle>שעות מתקנים להיום</ResidentSectionTitle>
              <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                {SANDBOX_AMENITIES.map((a) => (
                  <li key={a.id} style={{ marginBottom: 6 }}>
                    <strong>{a.name}</strong>:{' '}
                    {a.today.is_closed ? 'סגור' : `${a.today.opens_at}–${a.today.closes_at}`}
                  </li>
                ))}
              </ul>
            </ResidentCard>

            <div style={{ display: 'grid', gap: 10 }}>
              <ResidentPrimaryButton onClick={() => setTab('chat')}>
                שיחה עם הבוט — פתיחת תקלה מהירה
              </ResidentPrimaryButton>
              <ResidentPrimaryButton
                onClick={() => setTab('tickets')}
                style={{
                  background: 'linear-gradient(180deg, #3a3a4a 0%, #1A1A2E 46%, #12121f 100%)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.25)',
                }}
              >
                טופס תקלה מלא
              </ResidentPrimaryButton>
            </div>
          </div>
        ) : null}

        {tab === 'chat' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <ResidentCard style={{ padding: '14px 16px' }}>
              <ResidentPageTitle>בוט דיירים (Sandbox)</ResidentPageTitle>
              <ResidentMuted style={{ marginTop: 6 }}>
                הדגמה מקומית — אותם כוונות כמו בפורטל האמיתי, בלי שרת.
              </ResidentMuted>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {RESIDENT_BOT_QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    className="lg-chip resident-btn-press"
                    onClick={() => {
                      setChatMessages((prev) => [...prev, { role: 'user', content: q.message }])
                      runSandboxBot(q.message)
                    }}
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '8px 12px',
                      minHeight: 40,
                      background: 'rgba(255,255,255,0.92)',
                    }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </ResidentCard>
            <ResidentCard
              style={{
                display: 'grid',
                alignContent: 'start',
                gap: 8,
                maxHeight: 240,
                overflow: 'auto',
                minHeight: 120,
              }}
            >
              {chatMessages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={m.role === 'user' ? 'lg-chip lg-chip-active' : 'lg-chip'}
                  style={{
                    padding: 12,
                    borderRadius: residentTheme.radius.md,
                    whiteSpace: 'pre-wrap',
                    fontSize: 15,
                  }}
                >
                  {m.content}
                </div>
              ))}
            </ResidentCard>
            <ResidentCard style={{ display: 'grid', gap: 8, padding: 12 }}>
              {chatPending ? (
                <ResidentPrimaryButton
                  onClick={() =>
                    runSandboxBot(chatPending.message, true, chatPending.scope)
                  }
                >
                  אישור ופתיחת קריאה
                </ResidentPrimaryButton>
              ) : null}
              {chatActions.map((a, idx) => (
                <ResidentPrimaryButton
                  key={`${a.type}-${idx}`}
                  onClick={() => a.href && followSandboxAction(a.href)}
                >
                  {a.label}
                </ResidentPrimaryButton>
              ))}
              <form onSubmit={onChatSubmit} style={{ display: 'flex', gap: 8 }}>
                <ResidentField
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="כתבו הודעה…"
                  style={{ flex: 1, background: 'rgba(255,255,255,0.95)' }}
                  aria-label="הודעה לבוט"
                />
                <ResidentPrimaryButton type="submit" style={{ width: 'auto', minWidth: 88 }}>
                  שליחה
                </ResidentPrimaryButton>
              </form>
            </ResidentCard>
          </div>
        ) : null}

        {tab === 'payments' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <ResidentPageTitle>התשלומים שלי</ResidentPageTitle>
            <ResidentCard>
              יתרה פתוחה:{' '}
              <strong>₪{openBalance.toLocaleString('he-IL')}</strong>
            </ResidentCard>
            {payToast ? <ResidentAlert tone="warning">{payToast}</ResidentAlert> : null}
            {SANDBOX_CHARGES.map((c) => (
              <ResidentCard key={c.id}>
                <div style={{ fontWeight: 700 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: residentTheme.colors.textMuted, marginTop: 4 }}>
                  {c.period_label}
                  {c.due_date ? ` · פירעון ${c.due_date}` : ''}
                  {c.is_overdue ? ' · באיחור' : ''}
                </div>
                <div style={{ ...residentShellStyles.balanceValue, fontSize: 22, marginTop: 8 }}>
                  ₪{c.amount.toLocaleString('he-IL')}
                </div>
                <div style={{ fontSize: 13, marginTop: 4, color: residentTheme.colors.textSecondary }}>
                  סטטוס: {c.status === 'paid' ? 'שולם' : 'ממתין לתשלום'}
                </div>
                {c.invoice.available && c.invoice.url ? (
                  <a
                    href={c.invoice.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: 8,
                      color: residentTheme.colors.primary,
                      fontWeight: 600,
                    }}
                  >
                    מסמך כספי / חשבונית (PDF לדוגמה)
                  </a>
                ) : null}
                {c.can_pay ? (
                  <div style={{ marginTop: 12 }}>
                    <ResidentPrimaryButton onClick={fakePay}>תשלום מאובטח (הדגמה)</ResidentPrimaryButton>
                  </div>
                ) : null}
              </ResidentCard>
            ))}
          </div>
        ) : null}

        {tab === 'tickets' ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <ResidentPageTitle>תקלות</ResidentPageTitle>
            <ResidentCard>
              <label style={residentShellStyles.label}>תיאור</label>
              <ResidentTextArea
                value={ticketDesc}
                onChange={(e) => setTicketDesc(e.target.value)}
                rows={3}
                placeholder="למשל: נזילה בלובי…"
              />
              <label style={{ ...residentShellStyles.label, marginTop: 10 }}>סוג</label>
              <ResidentSelect
                value={ticketScope}
                onChange={(e) => setTicketScope(e.target.value as typeof ticketScope)}
                style={{ marginBottom: 12 }}
              >
                <option value="common">רכוש משותף</option>
                <option value="private">דירה פרטית</option>
                <option value="unclear">לא בטוח</option>
              </ResidentSelect>
              <ResidentPrimaryButton onClick={openTicket}>פתיחת קריאה (Sandbox)</ResidentPrimaryButton>
            </ResidentCard>
            {tickets.map((t) => (
              <ResidentCard key={t.id}>
                <div style={{ fontWeight: 700 }}>#{t.ticket_number}</div>
                <div style={{ fontSize: 13, color: residentTheme.colors.textMuted }}>
                  {t.status} · {t.scope}
                </div>
                <p style={{ margin: '8px 0 0' }}>{t.description}</p>
              </ResidentCard>
            ))}
          </div>
        ) : null}

        {tab === 'info' ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <ResidentPageTitle>מידע הבניין</ResidentPageTitle>

            <ResidentCard>
              <ResidentSectionTitle>הודעות</ResidentSectionTitle>
              {SANDBOX_ANNOUNCEMENTS.map((a) => (
                <div key={a.id} style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {a.title}
                    {a.is_pinned ? ' · נעוץ' : ''}
                  </div>
                  <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: residentTheme.colors.textSecondary }}>
                    {a.body}
                  </p>
                </div>
              ))}
            </ResidentCard>

            <ResidentCard>
              <ResidentSectionTitle>מסמכים</ResidentSectionTitle>
              {SANDBOX_DOCUMENTS.map((d) => (
                <ResidentDocumentPreviewButton
                  key={d.id}
                  fileName={d.file_name}
                  category={d.category}
                  href={d.url}
                />
              ))}
            </ResidentCard>

            <ResidentCard>
              <ResidentSectionTitle>מתקנים</ResidentSectionTitle>
              {SANDBOX_AMENITIES.map((a) => (
                <div key={a.id} style={{ marginBottom: 10 }}>
                  <strong>{a.name}</strong>
                  <div style={{ fontSize: 14, color: residentTheme.colors.textSecondary }}>
                    היום: {a.today.is_closed ? 'סגור' : `${a.today.opens_at}–${a.today.closes_at}`}
                  </div>
                  <ResidentMuted style={{ marginTop: 4 }}>{a.guidelines}</ResidentMuted>
                </div>
              ))}
            </ResidentCard>

            <ResidentCard>
              <ResidentSectionTitle>פרטי קשר</ResidentSectionTitle>
              <div>טלפון: {SANDBOX_RESIDENT.contactPhone}</div>
              <div>דוא״ל: {SANDBOX_RESIDENT.contactEmail}</div>
            </ResidentCard>

            <ResidentCard>
              <ResidentSectionTitle>חיפוש בעל מקצוע במידרג</ResidentSectionTitle>
              <ResidentSelect
                value={sectorId}
                onChange={(e) => setSectorId(Number(e.target.value))}
                style={{ marginBottom: 8 }}
              >
                {SECTORS.map((s) => (
                  <option key={s.sectorId} value={s.sectorId}>
                    {s.label}
                  </option>
                ))}
              </ResidentSelect>
              <ResidentMuted style={{ marginBottom: 8 }}>עיר: {SANDBOX_RESIDENT.city}</ResidentMuted>
              {midrag.href ? (
                <ResidentPrimaryButton href={midrag.href}>חיפוש במידרג</ResidentPrimaryButton>
              ) : null}
            </ResidentCard>
          </div>
        ) : null}
      </main>

      <nav className="lg-tabbar" aria-label="ניווט Sandbox" style={residentShellStyles.tabbar}>
        {(
          [
            { id: 'home', label: 'בית', icon: 'home' as const },
            { id: 'payments', label: 'תשלומים', icon: 'payments' as const },
            { id: 'tickets', label: 'תקלות', icon: 'tickets' as const },
            { id: 'info', label: 'מידע', icon: 'info' as const },
          ] as const
        ).map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={active ? 'lg-nav-active' : undefined}
              style={{
                ...residentShellStyles.tabItem,
                ...(active ? residentShellStyles.tabItemActive : null),
              }}
            >
              <ResidentNavIcon name={item.icon} active={active} />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

      {tab !== 'chat' ? (
        <button
          type="button"
          aria-label="שיחה עם הבוט"
          title="שיחה עם הבוט"
          className="lg-btn lg-btn-primary resident-bot-fab"
          style={{ ...residentShellStyles.fab, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => setTab('chat')}
        >
          <span aria-hidden style={{ display: 'grid', gap: 1, placeItems: 'center', lineHeight: 1.1 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3a7 7 0 0 0-7 7v1.5A2.5 2.5 0 0 0 7.5 14H8v3l3.2-2.4c.26-.2.58-.3.9-.3H12a7 7 0 0 0 0-14Z"
                fill="currentColor"
                opacity="0.95"
              />
              <circle cx="9.2" cy="10.2" r="1" fill="#007aff" />
              <circle cx="12" cy="10.2" r="1" fill="#007aff" />
              <circle cx="14.8" cy="10.2" r="1" fill="#007aff" />
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700 }}>בוט</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          aria-label="מעבר לטופס תקלות"
          className="lg-btn resident-bot-fab"
          style={{
            ...residentShellStyles.fab,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: 'rgba(255,255,255,0.85)',
            color: residentTheme.colors.primary,
            fontSize: 12,
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.9), 0 8px 22px rgba(0,70,150,0.12)',
          }}
          onClick={() => setTab('tickets')}
        >
          טופס
        </button>
      )}
    </div>
  )
}
