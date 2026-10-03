'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import type { SandboxStatus } from '@/lib/sandbox-lab'

type ActionResponse = {
  ok?: boolean
  error?: string
  message?: string
  url?: string
  ticket_id?: string
  ticket_number?: number | null
  status?: SandboxStatus
}

export function SandboxLabPanel({ secret }: { secret?: string }) {
  const [status, setStatus] = useState<SandboxStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [lastUrl, setLastUrl] = useState<string | null>(null)

  const [testPhone, setTestPhone] = useState('')
  const [smsSender, setSmsSender] = useState('')
  const [waId, setWaId] = useState('')
  const [waToken, setWaToken] = useState('')

  const applyStatus = useCallback((s: SandboxStatus) => {
    setStatus(s)
    setTestPhone(s.manager_phone || '')
    setSmsSender(s.sms_sender_name || '')
    setWaId(s.whatsapp_phone_number_id || '')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setFlash(null)
    try {
      const res = await fetch('/api/superadmin/sandbox', {
        credentials: 'same-origin' as RequestCredentials,
      })
      const json = (await res.json()) as { status?: SandboxStatus; error?: string }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      if (json.status) applyStatus(json.status)
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : 'שגיאה' })
    } finally {
      setLoading(false)
    }
  }, [applyStatus])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(action)
    setFlash(null)
    setLastUrl(null)
    try {
      const res = await fetch('/api/superadmin/sandbox', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...extra }),
      })
      const json = (await res.json()) as ActionResponse
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || 'הפעולה נכשלה')
      }
      if (json.status) applyStatus(json.status)
      setFlash({ ok: true, text: json.message || 'בוצע' })
      if (json.url) {
        setLastUrl(json.url)
        window.open(json.url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : 'שגיאה' })
    } finally {
      setBusy(null)
    }
  }

  if (loading && !status) {
    return <p className="sa-hint">טוען מעבדת Sandbox…</p>
  }

  return (
    <div style={styles.wrap} dir="rtl">
      <header style={styles.hero}>
        <h1 style={styles.h1}>מעבדת Sandbox</h1>
        <p style={styles.sub}>
          לקוח אמיתי במערכת בשם <strong>BINO Sandbox</strong>. לחצו על פעולות — תראו תוצאות בדשבורד,
          בטלפון ובקישורי תשלום. לא צ׳קליסט.
        </p>
        <p style={styles.meta}>
          Grow env: <code dir="ltr">{status?.grow_env || '—'}</code>
          {status?.exists ? (
            <>
              {' '}
              · client_id: <code dir="ltr">{status.client_id}</code>
            </>
          ) : null}
        </p>
      </header>

      {flash ? (
        <div style={{ ...styles.flash, background: flash.ok ? '#ecfdf5' : '#fef2f2', color: flash.ok ? '#065f46' : '#991b1b' }}>
          {flash.text}
          {lastUrl ? (
            <div style={{ marginTop: 8 }}>
              <a href={lastUrl} target="_blank" rel="noreferrer" style={styles.link} dir="ltr">
                {lastUrl}
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <section style={styles.card}>
        <LoadingButton
          onClick={() => void run('ensure')}
          loading={busy === 'ensure'}
          loadingText="מכין…"
          className="sa-btn sa-btn-primary"
          style={{ width: '100%', minHeight: 48, fontSize: 16, fontWeight: 800 }}
        >
          {status?.exists ? 'רענן / השלם Sandbox' : 'הכן Sandbox עכשיו'}
        </LoadingButton>
        <p className="sa-hint" style={{ marginTop: 8 }}>
          יוצר לקוח + בניין + עובד + דייר + תוסף גבייה. אדמין:{' '}
          <span dir="ltr">{status?.admin_email}</span>
        </p>
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>1. הטלפון שלכם לבדיקות</h2>
        <input
          className="sa-input"
          dir="ltr"
          placeholder="05xxxxxxxx"
          value={testPhone}
          onChange={(e) => setTestPhone(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <LoadingButton
          onClick={() => void run('set_test_phone', { to: testPhone })}
          loading={busy === 'set_test_phone'}
          loadingText="שומר…"
          className="sa-btn"
        >
          שמור טלפון
        </LoadingButton>
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>2. חברו ערוצים (אחרי 019 + Meta)</h2>
        <p className="sa-hint">
          קנו מספר ב-019 → חברו ב-Meta App של BINO → הדביקו כאן. מספר אחד = SMS + WhatsApp.
        </p>
        <label className="sa-field" style={styles.field}>
          <span>מספר שולח 019 (972…)</span>
          <input
            className="sa-input"
            dir="ltr"
            value={smsSender}
            onChange={(e) => setSmsSender(e.target.value)}
            placeholder="9725…"
          />
        </label>
        <label className="sa-field" style={styles.field}>
          <span>WA Phone Number ID</span>
          <input
            className="sa-input"
            dir="ltr"
            value={waId}
            onChange={(e) => setWaId(e.target.value)}
          />
        </label>
        <label className="sa-field" style={styles.field}>
          <span>WA Access Token {status?.whatsapp_access_token_set ? '(שמור — הדביקו רק לעדכון)' : ''}</span>
          <input
            className="sa-input"
            dir="ltr"
            type="password"
            value={waToken}
            onChange={(e) => setWaToken(e.target.value)}
            placeholder={status?.whatsapp_access_token_set ? '••••••••' : ''}
          />
        </label>
        <LoadingButton
          onClick={() =>
            void run('save_channels', {
              sms_sender_name: smsSender,
              whatsapp_phone_number_id: waId,
              whatsapp_access_token: waToken || undefined,
              manager_phone: testPhone || undefined,
            })
          }
          loading={busy === 'save_channels'}
          loadingText="שומר…"
          className="sa-btn sa-btn-primary"
          style={{ marginTop: 8 }}
        >
          שמור ערוצים ב-Sandbox
        </LoadingButton>
      </section>

      <section style={styles.card}>
        <h2 style={styles.h2}>3. Grow / דף תשלום ועד</h2>
        <p className="sa-hint">
          {status?.grow_user_id
            ? 'ל-Sandbox יש Grow משלו — חיוב ₪1 ירוץ עליו.'
            : 'userId של Grow ייחודי ללקוח. כפתור התשלום למטה יריץ ₪1 על Bamakor (שם Grow כבר חי), או תעשו GetLink ל-Sandbox בהמשך.'}
        </p>
        <LoadingButton
          onClick={() => void run('copy_grow_from_bamakor')}
          loading={busy === 'copy_grow_from_bamakor'}
          loadingText="מעדכן…"
          className="sa-btn"
        >
          עדכן פרטי עסק ל-/vaad-pay של Sandbox
        </LoadingButton>
      </section>

      <section style={styles.actions}>
        <h2 style={styles.h2}>4. פעולות חיות — לחצו ותראו</h2>

        <ActionBtn
          label="היכנס לדשבורד הלקוח"
          detail="Magic link כמנהל BINO Sandbox"
          busy={busy === 'magic_link'}
          onClick={() => void run('magic_link')}
          primary
        />
        <ActionBtn
          label="צור תקלה עכשיו"
          detail="תופיע בלוח הבקרה של ה-Sandbox"
          busy={busy === 'create_ticket'}
          onClick={() => void run('create_ticket')}
        />
        <ActionBtn
          label="שלח לי SMS עכשיו"
          detail="למספר שבשדה למעלה, עם שולח 019 של ה-Sandbox"
          busy={busy === 'send_sms'}
          onClick={() => void run('send_sms', { to: testPhone })}
        />
        <ActionBtn
          label="שלח לי WhatsApp עכשיו"
          detail="הודעת טקסט מ-Meta דרך המספר שחיברתם"
          busy={busy === 'send_whatsapp'}
          onClick={() => void run('send_whatsapp', { to: testPhone })}
        />
        <ActionBtn
          label="צור קישור תשלום ₪1"
          detail="נפתח /pay — שלמו ב-sandbox ותראו «שולם»"
          busy={busy === 'create_pay_link'}
          onClick={() => void run('create_pay_link')}
          primary
        />

        <div style={styles.linkRow}>
          {status?.report_url ? (
            <a className="sa-quick-btn" href={status.report_url} target="_blank" rel="noreferrer">
              טופס דיווח דייר
            </a>
          ) : null}
          {status?.worker_portal_url ? (
            <a className="sa-quick-btn" href={status.worker_portal_url} target="_blank" rel="noreferrer">
              פורטל עובד
            </a>
          ) : null}
          {status?.vaad_pay_url ? (
            <a className="sa-quick-btn" href={status.vaad_pay_url} target="_blank" rel="noreferrer">
              דף /vaad-pay
            </a>
          ) : null}
          {status?.client_id ? (
            <a className="sa-quick-btn" href={`/collections`} target="_blank" rel="noreferrer">
              מסך גבייה (אחרי כניסה כלקוח)
            </a>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function ActionBtn({
  label,
  detail,
  busy,
  onClick,
  primary,
}: {
  label: string
  detail: string
  busy: boolean
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      style={{
        ...styles.actionBtn,
        borderColor: primary ? theme.colors.primary : theme.colors.border,
        background: primary ? '#eff6ff' : theme.colors.surface,
        opacity: busy ? 0.7 : 1,
      }}
    >
      <span style={styles.actionLabel}>{busy ? 'רץ…' : label}</span>
      <span style={styles.actionDetail}>{detail}</span>
    </button>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 },
  hero: {
    padding: 16,
    borderRadius: 14,
    background: '#0f172a',
    color: '#f8fafc',
  },
  h1: { margin: 0, fontSize: 22, fontWeight: 800 },
  h2: { margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: theme.colors.textPrimary },
  sub: { margin: '8px 0 0', fontSize: 14, lineHeight: 1.5, color: '#cbd5e1' },
  meta: { margin: '10px 0 0', fontSize: 12, color: '#94a3b8' },
  card: {
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  field: { display: 'block', marginTop: 8 },
  flash: { padding: 12, borderRadius: 12, fontSize: 14, lineHeight: 1.45 },
  link: { color: 'inherit', wordBreak: 'break-all', fontSize: 12 },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: '#f8fafc',
  },
  actionBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
    textAlign: 'right',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid',
    cursor: 'pointer',
    width: '100%',
  },
  actionLabel: { fontWeight: 800, fontSize: 15, color: theme.colors.textPrimary },
  actionDetail: { fontSize: 12, color: theme.colors.textSecondary },
  linkRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
}
