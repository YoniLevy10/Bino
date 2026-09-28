'use client'

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import {
  residentSafeDescription,
  residentSafeTitle,
} from '@/lib/resident-safe-description'

type PayPayload = {
  title: string
  description: string | null
  amount: number
  amount_label: string
  currency: string
  status: string
  can_pay: boolean
  can_wallet_pay?: boolean
  payment_url: string | null
  paid_at: string | null
  receipt_email?: string | null
  receipt_phone?: string | null
  receipt_email_sent?: boolean
  suggested_email?: string | null
  suggested_phone?: string | null
  client: { name: string; logo_url: string | null }
  resident_name: string | null
  apartment_number: string | null
  project_name: string | null
}

declare global {
  interface Window {
    growPayment?: {
      init: (opts: {
        environment: string
        version: string
        events: Record<string, (payload?: unknown) => void>
      }) => void
      renderPaymentOptions: (authCode: string) => void
    }
  }
}

const GROW_SDK_SRC = 'https://cdn.meshulam.co.il/sdk/gs.min.js'

function loadGrowSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('no window'))
      return
    }
    if (window.growPayment) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GROW_SDK_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('טעינת תשלום נכשלה')), {
        once: true,
      })
      return
    }
    const s = document.createElement('script')
    s.src = GROW_SDK_SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('טעינת תשלום נכשלה'))
    document.head.appendChild(s)
  })
}

export default function PublicPayPage() {
  const params = useParams()
  const router = useRouter()
  const token = typeof params?.token === 'string' ? params.token : ''
  const [data, setData] = useState<PayPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [wantReceipt, setWantReceipt] = useState(true)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [walletBusy, setWalletBusy] = useState(false)
  const [walletHint, setWalletHint] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sdkReadyRef = useRef(false)

  async function refreshStatus(): Promise<PayPayload | null> {
    if (!token) return null
    const res = await fetchWithTimeout(`/api/public/pay/${encodeURIComponent(token)}`, {
      method: 'GET',
    })
    const json = (await res.json()) as PayPayload & { error?: string }
    if (!res.ok) return null
    setData(json)
    return json
  }

  useEffect(() => {
    if (!token) {
      setError('קישור לא תקין')
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const res = await fetchWithTimeout(`/api/public/pay/${encodeURIComponent(token)}`, {
          method: 'GET',
        })
        const json = (await res.json()) as PayPayload & { error?: string }
        if (!res.ok) {
          setError(json.error || 'חיוב לא נמצא')
          return
        }
        setData(json)
        setEmail((json.suggested_email || json.receipt_email || '').trim())
        setPhone((json.suggested_phone || json.receipt_phone || '').trim())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאת טעינה')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  function startPaidPoll() {
    if (pollRef.current) clearInterval(pollRef.current)
    let ticks = 0
    pollRef.current = setInterval(() => {
      ticks += 1
      void refreshStatus().then((row) => {
        if (row?.status === 'paid') {
          if (pollRef.current) clearInterval(pollRef.current)
          router.push(`/pay/success?t=${encodeURIComponent(token)}`)
        }
      })
      if (ticks >= 40 && pollRef.current) {
        clearInterval(pollRef.current)
        setWalletHint('אם שילמתם — אפשר לרענן בעוד רגע.')
      }
    }, 3000)
  }

  async function saveReceiptContact(): Promise<boolean> {
    if (!token) return false
    if (!wantReceipt && !phone.trim()) return true
    if (wantReceipt && !email.trim()) {
      setFormError('להודעת אישור במייל — הזינו כתובת מייל')
      return false
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout(
        `/api/public/pay/${encodeURIComponent(token)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: wantReceipt ? email.trim() || null : email.trim() || null,
            phone: phone.trim() || null,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setFormError(json.error || 'שמירת פרטים נכשלה')
        setSaving(false)
        return false
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'שמירה נכשלה')
      setSaving(false)
      return false
    }
    setSaving(false)
    return true
  }

  async function continueToPay(e: FormEvent) {
    e.preventDefault()
    if (!data?.payment_url || !token) return
    setFormError(null)
    setWalletHint(null)

    if (!acceptedTerms) {
      setFormError('יש לאשר את התקנון לפני המשך לתשלום')
      return
    }

    const ok = await saveReceiptContact()
    if (!ok) return

    window.location.href = data.payment_url
  }

  async function openWallet() {
    if (!data || !token) return
    setFormError(null)
    setWalletHint(null)

    if (!acceptedTerms) {
      setFormError('יש לאשר את התקנון לפני המשך לתשלום')
      return
    }
    if (!phone.trim()) {
      setFormError('נדרש מספר טלפון לתשלום')
      return
    }

    const contactOk = await saveReceiptContact()
    if (!contactOk) return

    setWalletBusy(true)
    try {
      await loadGrowSdk()
      const res = await fetchWithTimeout(
        `/api/public/pay/${encodeURIComponent(token)}/wallet`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone.trim(),
            email: wantReceipt ? email.trim() || null : email.trim() || null,
            full_name: data.resident_name || undefined,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        authCode?: string
        sdkEnvironment?: 'DEV' | 'PRODUCTION'
      }
      if (!res.ok || !json.authCode) {
        setFormError(json.error || 'פתיחת התשלום נכשלה')
        setWalletBusy(false)
        return
      }

      if (!window.growPayment) {
        setFormError('לא ניתן לפתוח תשלום כרגע')
        setWalletBusy(false)
        return
      }

      if (!sdkReadyRef.current) {
        window.growPayment.init({
          environment: json.sdkEnvironment || 'DEV',
          version: '1',
          events: {
            onSuccess: () => {
              setWalletHint('התשלום התקבל. מעדכנים…')
              startPaidPoll()
            },
            onFailure: () => {
              setWalletHint('התשלום לא הושלם.')
              setWalletBusy(false)
            },
            onError: () => {
              setWalletHint('אירעה שגיאה בתשלום.')
              setWalletBusy(false)
            },
            onTimeout: () => {
              setWalletHint('פג הזמן. אפשר לנסות שוב.')
              setWalletBusy(false)
            },
            onWalletChange: () => {},
          },
        })
        sdkReadyRef.current = true
      }

      window.growPayment.renderPaymentOptions(json.authCode)
      setWalletHint(null)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'פתיחת תשלום נכשלה')
    } finally {
      setWalletBusy(false)
    }
  }

  if (loading) {
    return (
      <main dir="rtl" style={styles.shell}>
        <p style={{ color: '#94a3b8' }}>טוען…</p>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main dir="rtl" style={styles.shell}>
        <div style={styles.card}>
          <p style={styles.brandMark}>Bino</p>
          <h1 style={styles.title}>לא ניתן להציג את החיוב</h1>
          <p style={styles.sub}>{error || 'שגיאה'}</p>
        </div>
      </main>
    )
  }

  const showPayForm = data.can_pay || data.can_wallet_pay
  const description = residentSafeDescription(data.description)
  const title = residentSafeTitle(data.title)
  const clientName = data.client.name || 'ועד הבית'
  const locationLine = [data.project_name, data.apartment_number ? `דירה ${data.apartment_number}` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <main dir="rtl" style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.heroBand}>
          {data.client.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.client.logo_url} alt="" style={styles.logo} />
          ) : (
            <div style={styles.logoFallback}>{clientName.slice(0, 1)}</div>
          )}
          <p style={styles.brand}>{clientName}</p>
          <h1 style={styles.heroTitle}>{title}</h1>
          <p style={styles.amount}>{data.amount_label}</p>
          {(data.resident_name || locationLine) && (
            <p style={styles.meta}>
              {[data.resident_name, locationLine].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div style={styles.body}>
          {description ? <p style={styles.sub}>{description}</p> : null}

          {data.status === 'paid' ? (
            <div style={styles.paidBox}>
              <p style={styles.paidTitle}>התשלום התקבל. תודה!</p>
              {data.receipt_email_sent ? (
                <p style={styles.metaDark}>אישור נשלח למייל.</p>
              ) : data.receipt_email ? (
                <p style={styles.metaDark}>אישור במייל בדרך אליכם.</p>
              ) : null}
            </div>
          ) : null}

          {showPayForm ? (
            <form onSubmit={(e) => void continueToPay(e)} style={styles.form}>
              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={wantReceipt}
                  onChange={(ev) => setWantReceipt(ev.target.checked)}
                />
                שלחו לי אישור תשלום במייל
              </label>
              {wantReceipt ? (
                <label style={styles.fieldLabel}>
                  מייל
                  <input
                    type="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    style={styles.input}
                    placeholder="name@example.com"
                    dir="ltr"
                    autoComplete="email"
                  />
                </label>
              ) : null}
              <label style={styles.fieldLabel}>
                טלפון
                <input
                  type="tel"
                  value={phone}
                  onChange={(ev) => setPhone(ev.target.value)}
                  style={styles.input}
                  placeholder="05xxxxxxxx"
                  dir="ltr"
                  autoComplete="tel"
                />
              </label>
              <label style={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(ev) => setAcceptedTerms(ev.target.checked)}
                  required
                />
                <span>
                  קראתי ואני מאשר/ת את{' '}
                  <Link
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.inlineLink}
                  >
                    התקנון
                  </Link>{' '}
                  ואת{' '}
                  <Link
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.inlineLink}
                  >
                    מדיניות הפרטיות
                  </Link>
                </span>
              </label>

              {formError ? <p style={styles.formErr}>{formError}</p> : null}
              {walletHint ? <p style={styles.walletHint}>{walletHint}</p> : null}

              {data.can_pay && data.payment_url ? (
                <button
                  type="submit"
                  style={styles.ctaBtn}
                  disabled={saving || walletBusy || !acceptedTerms}
                >
                  {saving ? 'שומר…' : 'לתשלום מאובטח'}
                </button>
              ) : null}

              {data.can_wallet_pay ? (
                <button
                  type="button"
                  style={data.can_pay && data.payment_url ? styles.secondaryBtn : styles.ctaBtn}
                  disabled={saving || walletBusy || !acceptedTerms}
                  onClick={() => void openWallet()}
                >
                  {walletBusy ? 'פותח…' : 'תשלום מהיר'}
                </button>
              ) : null}

              <p style={styles.legalLinks}>
                <Link href="/contact" style={styles.inlineLink}>
                  יצירת קשר
                </Link>
              </p>
            </form>
          ) : data.status !== 'paid' ? (
            <p style={styles.sub}>אין אפשרות תשלום פעילה לחיוב זה.</p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background:
      'radial-gradient(1200px 500px at 80% -10%, rgba(56,189,248,0.18), transparent 55%), linear-gradient(165deg, #0f2744 0%, #1e3a5f 42%, #e8eef5 42%, #f8fafc 100%)',
    fontFamily: 'var(--font-heebo), Heebo, Arial, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    overflow: 'hidden',
    background: '#fff',
    boxShadow: '0 18px 50px rgba(15, 39, 68, 0.22)',
  },
  heroBand: {
    padding: '28px 24px 22px',
    textAlign: 'center',
    background: 'linear-gradient(150deg, #0f2744 0%, #1e3a5f 100%)',
    color: '#f8fafc',
  },
  body: {
    padding: '20px 22px 24px',
  },
  logo: {
    width: 56,
    height: 56,
    objectFit: 'contain',
    marginBottom: 12,
    borderRadius: 14,
    background: '#fff',
  },
  logoFallback: {
    width: 56,
    height: 56,
    borderRadius: 14,
    margin: '0 auto 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontWeight: 800,
    fontSize: 22,
  },
  brandMark: {
    margin: '0 0 8px',
    fontSize: 14,
    fontWeight: 700,
    color: '#1e3a5f',
    textAlign: 'center',
  },
  brand: {
    margin: '0 0 8px',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.02em',
    opacity: 0.9,
  },
  heroTitle: {
    margin: '0 0 10px',
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  title: {
    margin: '0 0 12px',
    fontSize: 24,
    color: '#0f172a',
    textAlign: 'center',
  },
  amount: {
    margin: '0 0 8px',
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  meta: {
    margin: 0,
    fontSize: 14,
    opacity: 0.8,
  },
  metaDark: {
    margin: '6px 0 0',
    fontSize: 14,
    color: '#475569',
  },
  sub: {
    margin: '0 0 14px',
    fontSize: 15,
    color: '#64748b',
    lineHeight: 1.55,
    textAlign: 'center',
  },
  paidBox: {
    textAlign: 'center',
    padding: '8px 0 4px',
  },
  paidTitle: {
    margin: 0,
    color: '#15803d',
    fontWeight: 700,
    fontSize: 17,
  },
  form: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: 600,
    lineHeight: 1.4,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    color: '#475569',
    fontWeight: 600,
  },
  input: {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    fontSize: 16,
    fontFamily: 'inherit',
    background: '#f8fafc',
  },
  formErr: {
    margin: 0,
    color: '#b91c1c',
    fontSize: 13,
    textAlign: 'center',
  },
  walletHint: {
    margin: 0,
    color: '#1e40af',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 1.45,
  },
  inlineLink: {
    color: '#1e40af',
    fontWeight: 700,
    textDecoration: 'underline',
  },
  legalLinks: {
    margin: '4px 0 0',
    fontSize: 13,
    textAlign: 'center',
    color: '#64748b',
  },
  ctaBtn: {
    display: 'block',
    width: '100%',
    padding: '15px 28px',
    background: '#1e40af',
    color: '#fff',
    borderRadius: 14,
    fontWeight: 700,
    fontSize: 17,
    border: 'none',
    cursor: 'pointer',
    marginTop: 4,
  },
  secondaryBtn: {
    display: 'block',
    width: '100%',
    padding: '12px 28px',
    background: 'transparent',
    color: '#1e40af',
    borderRadius: 14,
    fontWeight: 700,
    fontSize: 15,
    border: '1px solid #93c5fd',
    cursor: 'pointer',
  },
}
