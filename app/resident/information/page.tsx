'use client'

import { useEffect, useState } from 'react'
import {
  buildMidragCityPickerUrl,
  buildMidragSearchUrl,
  midragCityMatchForCity,
  MIDRAG_TRADE_CATEGORIES,
  tradeLabelHe,
} from '@/lib/midrag/external-search'

export default function ResidentInformationPage() {
  const [announcements, setAnnouncements] = useState<
    Array<{ id: string; title: string; body: string }>
  >([])
  const [documents, setDocuments] = useState<
    Array<{ id: string; file_name: string; category: string | null }>
  >([])
  const [amenities, setAmenities] = useState<
    Array<{
      id: string
      name: string
      guidelines: string | null
      today: { source: string; is_closed: boolean; opens_at: string | null; closes_at: string | null }
    }>
  >([])
  const [city, setCity] = useState<string | null>(null)
  const [trade, setTrade] = useState('plumbing')
  const [error, setError] = useState('')
  const [contact, setContact] = useState<{ phone?: string | null; email?: string | null }>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [a, d, m, h] = await Promise.all([
          fetch('/api/resident/announcements').then((r) => r.json()),
          fetch('/api/resident/documents').then((r) => r.json()),
          fetch('/api/resident/amenities').then((r) => r.json()),
          fetch('/api/resident/home').then((r) => r.json()),
        ])
        if (cancelled) return
        if (a.error || d.error || m.error || h.error) {
          setError(a.error || d.error || m.error || h.error)
        }
        setAnnouncements(a.announcements || [])
        setDocuments(d.documents || [])
        setAmenities(m.amenities || [])
        setCity(h.membership?.project_city || h.project?.city || null)
        setContact({
          phone: h.project?.resident_portal_contact_phone,
          email: h.project?.resident_portal_contact_email,
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאת רשת')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function openDoc(id: string) {
    const res = await fetch(`/api/resident/documents/${id}/signed-url`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'פתיחת מסמך נכשלה')
      return
    }
    window.open(json.url, '_blank', 'noopener,noreferrer')
  }

  const cityMatch = midragCityMatchForCity(city)
  const midragUrl = cityMatch ? buildMidragSearchUrl({ category: trade, city }) : null
  const cityPicker = buildMidragCityPickerUrl({ category: trade, city })

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>מידע הבניין</h1>
      {error ? (
        <div role="alert" style={{ background: '#FFEBE9', color: '#FF3B30', padding: 12, borderRadius: 12 }}>
          {error}
        </div>
      ) : null}

      <section style={card}>
        <h2 style={h2}>הודעות</h2>
        {announcements.length === 0 ? (
          <p style={{ color: '#86868B', margin: 0 }}>אין הודעות שפורסמו</p>
        ) : (
          announcements.map((a) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{a.title}</div>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{a.body}</p>
            </div>
          ))
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>מסמכים</h2>
        {documents.length === 0 ? (
          <p style={{ color: '#86868B', margin: 0 }}>אין מסמכים שפורסמו לדיירים</p>
        ) : (
          documents.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => void openDoc(d.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'right',
                background: '#F5F5F7',
                border: 'none',
                borderRadius: 10,
                padding: 12,
                marginBottom: 8,
                minHeight: 44,
                fontSize: 15,
              }}
            >
              {d.file_name}
              {d.category ? ` · ${d.category}` : ''}
            </button>
          ))
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>מתקנים</h2>
        {amenities.length === 0 ? (
          <p style={{ color: '#86868B', margin: 0 }}>לא פורסם מידע על מתקנים</p>
        ) : (
          amenities.map((a) => (
            <div key={a.id} style={{ marginBottom: 10 }}>
              <strong>{a.name}</strong>
              <div style={{ fontSize: 14, color: '#3C3C43' }}>
                היום:{' '}
                {a.today.source === 'none'
                  ? 'לא פורסמו שעות'
                  : a.today.is_closed
                    ? 'סגור'
                    : `${a.today.opens_at}–${a.today.closes_at}`}
              </div>
              {a.guidelines ? (
                <div style={{ fontSize: 13, color: '#86868B', marginTop: 4 }}>{a.guidelines}</div>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>פרטי קשר</h2>
        {!contact.phone && !contact.email ? (
          <p style={{ color: '#86868B', margin: 0 }}>לא פורסמו פרטי קשר</p>
        ) : (
          <div style={{ fontSize: 15 }}>
            {contact.phone ? <div>טלפון: {contact.phone}</div> : null}
            {contact.email ? <div>דוא״ל: {contact.email}</div> : null}
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>חיפוש בעל מקצוע במידרג</h2>
        <p style={{ fontSize: 13, color: '#86868B', marginTop: 0 }}>
          נפתח אתר מידרג בלשונית חדשה. אין הזמנה או אישור זמינות דרך BINO.
        </p>
        <label style={{ fontSize: 13 }}>מקצוע</label>
        <select
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          style={{ width: '100%', minHeight: 44, marginBottom: 8, fontSize: 16 }}
        >
          {MIDRAG_TRADE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {tradeLabelHe(c)}
            </option>
          ))}
        </select>
        <div style={{ fontSize: 13, marginBottom: 8 }}>עיר הפרויקט: {city || 'לא הוגדרה'}</div>
        {midragUrl ? (
          <a href={midragUrl} target="_blank" rel="noopener noreferrer" style={btn}>
            חיפוש במידרג
          </a>
        ) : (
          <a
            href={cityPicker || 'https://www.midrag.co.il/'}
            target="_blank"
            rel="noopener noreferrer"
            style={btn}
          >
            בחירת עיר במידרג
          </a>
        )}
      </section>
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
const btn: React.CSSProperties = {
  display: 'inline-flex',
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 16px',
  borderRadius: 12,
  background: '#007AFF',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
}
