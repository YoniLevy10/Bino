'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

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

const STATUS_HE: Record<string, string> = {
  draft: 'ממתין לשליחה',
  sent: 'ממתין לתשלום',
  paid: 'שולם',
  failed: 'נכשל',
  cancelled: 'בוטל',
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

  async function continueToPay(e: FormEvent) {
    e.preventDefault()
    if (!data?.payment_url || !token) return
    setFormError(null)

    if (!acceptedTerms) {
      setFormError('יש לאשר את התקנון לפני המשך לתשלום')
      return
    }

    if (wantReceipt && !email.trim()) {
      setFormError('להודעת אישור במייל — הזינו כתובת מייל')
      return
    }

    if (wantReceipt || phone.trim()) {
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
          return
        }
      } catch (err) {
        setFormError(err instanceof Error ? err.message : 'שמירה נכשלה')
        setSaving(false)
        return
      }
      setSaving(false)
    }

    window.location.href = data.payment_url
  }

  if (loading) {
    return (
      <main dir="rtl" style={styles.shell}>
        <p style={{ color: '#64748b' }}>טוען...</p>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main dir="rtl" style={styles.shell}>
        <div style={styles.panel}>
          <p style={styles.brand}>במקור</p>
          <h1 style={styles.title}>לא ניתן להציג את החיוב</h1>
          <p style={styles.sub}>{error || 'שגיאה'}</p>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" style={styles.shell}>
      <div style={styles.panel}>
        {data.client.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.client.logo_url} alt="" style={styles.logo} />
        ) : null}
        <p style={styles.brand}>{data.client.name || 'במקור'}</p>
        <h1 style={styles.title}>{data.title}</h1>
        <p style={styles.amount}>{data.amount_label}</p>
        {(data.resident_name || data.apartment_number || data.project_name) && (
          <p style={styles.meta}>
            {[
              data.resident_name,
              data.apartment_number ? `דירה ${data.apartment_number}` : null,
              data.project_name,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {data.description ? <p style={styles.sub}>{data.description}</p> : null}
        <p style={styles.status}>סטטוס: {STATUS_HE[data.status] || data.status}</p>

        {data.can_pay && data.payment_url ? (
          <form onSubmit={(e) => void continueToPay(e)} style={styles.form}>
            <p style={styles.formLead}>
              אישור התשלום יישלח <strong>במייל</strong> (בלי SMS) — חסכוני ונוח.
            </p>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={wantReceipt}
                onChange={(ev) => setWantReceipt(ev.target.checked)}
              />
              שלחו לי אישור תשלום במייל
            </label>
            <label style={styles.fieldLabel}>
              מייל לקבלה
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
            <label style={styles.fieldLabel}>
              טלפון (אופציונלי)
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
                <Link href="/terms" target="_blank" rel="noopener noreferrer" style={styles.inlineLink}>
                  התקנון
                </Link>{' '}
                ואת{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" style={styles.inlineLink}>
                  מדיניות הפרטיות
                </Link>
              </span>
            </label>
            <p style={styles.legalLinks}>
              <Link href="/contact" style={styles.inlineLink}>
                יצירת קשר
              </Link>
              {' · '}
              <Link href="/vaad-pay" style={styles.inlineLink}>
                על השירות
              </Link>
            </p>
            {formError ? <p style={styles.formErr}>{formError}</p> : null}
            <button type="submit" style={styles.ctaBtn} disabled={saving || !acceptedTerms}>
              {saving ? 'שומר…' : 'המשך לתשלום מאובטח'}
            </button>
          </form>
        ) : data.status === 'paid' ? (
          <div>
            <p style={{ ...styles.sub, color: '#15803d', fontWeight: 600 }}>
              התשלום כבר התקבל. תודה!
            </p>
            {data.receipt_email_sent ? (
              <p style={styles.meta}>אישור נשלח למייל.</p>
            ) : data.receipt_email ? (
              <p style={styles.meta}>אישור במייל בדרך אליכם.</p>
            ) : null}
          </div>
        ) : (
          <p style={styles.sub}>אין קישור תשלום פעיל לחיוב זה.</p>
        )}
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
    padding: 24,
    background: 'linear-gradient(165deg, #eff6ff 0%, #f8fafc 45%, #e2e8f0 100%)',
    fontFamily: 'Heebo, Arial, sans-serif',
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    textAlign: 'center',
  },
  logo: {
    width: 64,
    height: 64,
    objectFit: 'contain',
    marginBottom: 12,
    borderRadius: 12,
  },
  brand: {
    margin: '0 0 8px',
    fontSize: 15,
    fontWeight: 700,
    color: '#1e3a5f',
    letterSpacing: '0.02em',
  },
  title: {
    margin: '0 0 12px',
    fontSize: 26,
    color: '#0f172a',
    lineHeight: 1.35,
  },
  amount: {
    margin: '0 0 12px',
    fontSize: 36,
    fontWeight: 800,
    color: '#0f172a',
  },
  meta: {
    margin: '0 0 8px',
    fontSize: 14,
    color: '#475569',
  },
  sub: {
    margin: '0 0 16px',
    fontSize: 15,
    color: '#64748b',
    lineHeight: 1.6,
  },
  status: {
    margin: '0 0 24px',
    fontSize: 13,
    color: '#64748b',
  },
  form: {
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  formLead: {
    margin: 0,
    fontSize: 14,
    color: '#334155',
    lineHeight: 1.5,
    textAlign: 'center',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    color: '#0f172a',
    fontWeight: 600,
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
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    fontSize: 16,
    fontFamily: 'inherit',
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
    margin: 0,
    fontSize: 13,
    textAlign: 'center',
    color: '#64748b',
  },
  ctaBtn: {
    display: 'block',
    width: '100%',
    padding: '14px 28px',
    background: '#1e40af',
    color: '#fff',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 16,
    border: 'none',
    cursor: 'pointer',
    marginTop: 4,
  },
}
