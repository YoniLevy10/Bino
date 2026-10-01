'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
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

export default function PublicPayPage() {
  const params = useParams()
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
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        payment_url?: string | null
      }
      if (!res.ok) {
        setFormError(json.error || 'שמירת פרטים נכשלה')
        setSaving(false)
        return false
      }
      if (json.payment_url) {
        setData((prev) => (prev ? { ...prev, payment_url: json.payment_url! } : prev))
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

    if (!acceptedTerms) {
      setFormError('יש לאשר את התקנון לפני המשך לתשלום')
      return
    }

    const ok = await saveReceiptContact()
    if (!ok) return

    const payUrl = data.payment_url
    if (!payUrl) {
      setFormError('קישור התשלום לא מוכן — נסו שוב')
      return
    }
    window.location.href = payUrl
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

  const showPayForm = Boolean(data.can_pay && data.payment_url)
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
              <Link
                href="/resident/payments"
                style={styles.residentCta}
              >
                לאזור האישי שלי
              </Link>
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

              <button
                type="submit"
                style={styles.ctaBtn}
                disabled={saving || !acceptedTerms}
              >
                {saving ? 'שומר…' : 'לתשלום מאובטח'}
              </button>

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
  residentCta: {
    display: 'block',
    width: '100%',
    marginTop: 14,
    padding: '12px 20px',
    borderRadius: 12,
    border: '1px solid #93c5fd',
    background: '#fff',
    color: '#1e40af',
    fontWeight: 700,
    fontSize: 15,
    textAlign: 'center',
    textDecoration: 'none',
    boxSizing: 'border-box',
  },
}
