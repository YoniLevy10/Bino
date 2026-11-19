'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { useParams } from 'next/navigation'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { isValidBuildingAssetSlug } from '@/lib/building-asset-public'

type AssetPayload = {
  asset: { id: string; name: string; kind: string; notes: string | null }
  project: { id: string; name: string; project_code: string; address: string | null } | null
  client_id: string
  tickets: Array<{
    ticket_number: number
    description: string
    status: string
    created_at: string
  }>
  tasks: Array<{
    title: string
    status: string
    due_at: string | null
    completed_at: string | null
  }>
}

function AssetPageInner() {
  const params = useParams()
  const slug = String(params?.slug || '').trim().toLowerCase()

  const [data, setData] = useState<AssetPayload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [description, setDescription] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isValidBuildingAssetSlug(slug)) {
        setLoadError('קישור הציוד אינו תקין')
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const res = await fetchWithTimeout(`/api/public/building-asset/${encodeURIComponent(slug)}`)
        const json = (await res.json().catch(() => ({}))) as AssetPayload & { error?: string }
        if (!res.ok) {
          if (!cancelled) setLoadError(json.error || 'ציוד לא נמצא')
          return
        }
        if (!cancelled) {
          setData(json)
          setLoadError('')
        }
      } catch {
        if (!cancelled) setLoadError('טעינה נכשלה — נסו שוב')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!data?.project?.project_code) {
      setFormError('חסר בניין לציוד')
      return
    }
    const desc = description.trim()
    if (desc.length < 3) {
      setFormError('כתבו תיאור קצר של התקלה (לפחות 3 תווים)')
      return
    }
    setSubmitting(true)
    setFormError('')
    setSuccess('')
    try {
      const fd = new FormData()
      fd.append('description', desc)
      fd.append('project_code', data.project.project_code)
      fd.append('client_id', data.client_id)
      fd.append('asset_id', data.asset.id)
      fd.append('source', 'asset_qr')
      if (reporterName.trim()) fd.append('reporter_name', reporterName.trim())

      const res = await fetchWithTimeout(
        '/api/create-ticket',
        { method: 'POST', body: fd },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        ticketNumber?: number
      }
      if (!res.ok) {
        setFormError(json.error || 'פתיחת התקלה נכשלה')
        return
      }
      setSuccess(
        json.ticketNumber != null
          ? `התקלה נפתחה (#${json.ticketNumber}). תודה.`
          : 'התקלה נפתחה. תודה.'
      )
      setDescription('')
    } catch {
      setFormError('שגיאת חיבור — נסו שוב')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>טוען…</p>
      </main>
    )
  }

  if (loadError || !data) {
    return (
      <main style={styles.page}>
        <h1 style={styles.title}>ציוד לא זמין</h1>
        <p style={styles.muted}>{loadError || 'לא נמצא'}</p>
        <Link href="/" style={styles.link}>
          חזרה ל־BINO
        </Link>
      </main>
    )
  }

  const buildingLabel = data.project?.name || 'בניין'
  const address = data.project?.address

  return (
    <main style={styles.page}>
      <p style={styles.eyebrow}>זיכרון תפעולי לציוד</p>
      <h1 style={styles.title}>{data.asset.name}</h1>
      <p style={styles.subtitle}>
        {buildingLabel}
        {address ? ` · ${address}` : ''}
        {data.asset.kind && data.asset.kind !== 'other' ? ` · ${data.asset.kind}` : ''}
      </p>
      {data.asset.notes ? <p style={styles.notes}>{data.asset.notes}</p> : null}

      <section style={styles.section}>
        <h2 style={styles.h2}>פתחו תקלה על הציוד הזה</h2>
        <p style={styles.muted}>כתבו בקצרה מה קרה — הדיווח משויך אוטומטית לציוד.</p>
        {success ? (
          <p style={styles.success} role="status">
            {success}
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} style={styles.form}>
            <label style={styles.label}>
              מה התקלה?
              <textarea
                style={styles.textarea}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="למשל: המזגן לא מקרר / רעש חזק"
                required
              />
            </label>
            <label style={styles.label}>
              שם (אופציונלי)
              <input
                style={styles.input}
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="שמכם"
              />
            </label>
            {formError ? (
              <p style={styles.error} role="alert">
                {formError}
              </p>
            ) : null}
            <button type="submit" style={styles.cta} disabled={submitting}>
              {submitting ? 'שולח…' : 'פתח תקלה'}
            </button>
          </form>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>היסטוריית תקלות</h2>
        {data.tickets.length === 0 ? (
          <p style={styles.muted}>עדיין אין תקלות משויכות.</p>
        ) : (
          <ul style={styles.list}>
            {data.tickets.map((t) => (
              <li key={`${t.ticket_number}-${t.created_at}`} style={styles.listItem}>
                <strong>#{t.ticket_number}</strong> · {t.status}
                <div style={styles.listDesc}>{t.description}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.h2}>משימות אחזקה</h2>
        {data.tasks.length === 0 ? (
          <p style={styles.muted}>אין משימות מקושרות עדיין.</p>
        ) : (
          <ul style={styles.list}>
            {data.tasks.map((t, i) => (
              <li key={`${t.title}-${i}`} style={styles.listItem}>
                <strong>{t.title}</strong> · {t.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default function AssetPublicPage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <p style={styles.muted}>טוען…</p>
        </main>
      }
    >
      <AssetPageInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 520,
    margin: '0 auto',
    padding: '28px 20px 48px',
    fontFamily: 'Heebo, Assistant, Arial, sans-serif',
    direction: 'rtl',
    color: '#1a2332',
    background: 'linear-gradient(180deg, #f3f6fa 0%, #e8eef5 100%)',
    minHeight: '100vh',
  },
  eyebrow: { margin: 0, fontSize: 13, letterSpacing: '0.04em', color: '#5a6b7d' },
  title: { margin: '6px 0 8px', fontSize: 28, fontWeight: 700, lineHeight: 1.25 },
  subtitle: { margin: '0 0 12px', fontSize: 16, color: '#3d4f63' },
  notes: { margin: '0 0 20px', fontSize: 14, color: '#5a6b7d' },
  section: {
    marginTop: 24,
    padding: '18px 16px',
    background: 'rgba(255,255,255,0.82)',
    borderRadius: 12,
    border: '1px solid rgba(26,35,50,0.08)',
  },
  h2: { margin: '0 0 8px', fontSize: 18, fontWeight: 650 },
  muted: { margin: '0 0 12px', fontSize: 14, color: '#5a6b7d', lineHeight: 1.45 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 },
  textarea: {
    font: 'inherit',
    padding: 12,
    borderRadius: 10,
    border: '1px solid #c5d0dc',
    resize: 'vertical',
  },
  input: {
    font: 'inherit',
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #c5d0dc',
  },
  cta: {
    font: 'inherit',
    fontWeight: 700,
    padding: '14px 16px',
    borderRadius: 10,
    border: 'none',
    background: '#1a6b4a',
    color: '#fff',
    cursor: 'pointer',
  },
  error: { margin: 0, color: '#b42318', fontSize: 14 },
  success: { margin: 0, color: '#1a6b4a', fontSize: 16, fontWeight: 600 },
  list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 },
  listItem: { fontSize: 14, lineHeight: 1.4 },
  listDesc: { color: '#5a6b7d', marginTop: 4 },
  link: { color: '#1a6b4a', fontWeight: 600 },
}
