'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

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
      } catch (e) {
        setError(e instanceof Error ? e.message : 'שגיאת טעינה')
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

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
          <p style={styles.brand}>במאקור</p>
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
        <p style={styles.brand}>{data.client.name || 'במאקור'}</p>
        <h1 style={styles.title}>{data.title}</h1>
        <p style={styles.amount}>{data.amount_label}</p>
        {(data.resident_name || data.apartment_number || data.project_name) && (
          <p style={styles.meta}>
            {[data.resident_name, data.apartment_number ? `דירה ${data.apartment_number}` : null, data.project_name]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {data.description ? <p style={styles.sub}>{data.description}</p> : null}
        <p style={styles.status}>סטטוס: {STATUS_HE[data.status] || data.status}</p>

        {data.can_pay && data.payment_url ? (
          <a href={data.payment_url} style={styles.cta}>
            לתשלום מאובטח
          </a>
        ) : data.status === 'paid' ? (
          <p style={{ ...styles.sub, color: '#15803d', fontWeight: 600 }}>התשלום כבר התקבל. תודה!</p>
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
  cta: {
    display: 'inline-block',
    padding: '14px 28px',
    background: '#1e40af',
    color: '#fff',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
  },
}
