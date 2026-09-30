'use client'

import { useEffect, useState } from 'react'
import { residentMidragSearchHref, residentMidragSectors } from '@/lib/resident-portal/midrag'
import {
  ResidentAlert,
  ResidentCard,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  ResidentSectionTitle,
  ResidentSelect,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

const SECTORS = residentMidragSectors()

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
  const [sectorId, setSectorId] = useState<number>(SECTORS[0]?.sectorId ?? 4)
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

  const midrag = residentMidragSearchHref({ sectorId, city })

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <ResidentPageTitle>מידע הבניין</ResidentPageTitle>
      {error ? <ResidentAlert tone="error">{error}</ResidentAlert> : null}

      <ResidentCard>
        <ResidentSectionTitle>הודעות</ResidentSectionTitle>
        {announcements.length === 0 ? (
          <ResidentMuted>אין הודעות שפורסמו</ResidentMuted>
        ) : (
          announcements.map((a) => (
            <div key={a.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>{a.title}</div>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', color: residentTheme.colors.textSecondary }}>
                {a.body}
              </p>
            </div>
          ))
        )}
      </ResidentCard>

      <ResidentCard>
        <ResidentSectionTitle>מסמכים</ResidentSectionTitle>
        {documents.length === 0 ? (
          <ResidentMuted>אין מסמכים שפורסמו לדיירים</ResidentMuted>
        ) : (
          documents.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => void openDoc(d.id)}
              className="lg-chip"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'right',
                padding: 12,
                marginBottom: 8,
                minHeight: 44,
                fontSize: 15,
                cursor: 'pointer',
                borderRadius: residentTheme.radius.md,
                color: residentTheme.colors.textPrimary,
                fontFamily: 'inherit',
              }}
            >
              {d.file_name}
              {d.category ? ` · ${d.category}` : ''}
            </button>
          ))
        )}
      </ResidentCard>

      <ResidentCard>
        <ResidentSectionTitle>מתקנים</ResidentSectionTitle>
        {amenities.length === 0 ? (
          <ResidentMuted>לא פורסם מידע על מתקנים</ResidentMuted>
        ) : (
          amenities.map((a) => (
            <div key={a.id} style={{ marginBottom: 10 }}>
              <strong>{a.name}</strong>
              <div style={{ fontSize: 14, color: residentTheme.colors.textSecondary }}>
                היום:{' '}
                {a.today.source === 'none'
                  ? 'לא פורסמו שעות'
                  : a.today.is_closed
                    ? 'סגור'
                    : `${a.today.opens_at}–${a.today.closes_at}`}
              </div>
              {a.guidelines ? (
                <ResidentMuted style={{ marginTop: 4 }}>{a.guidelines}</ResidentMuted>
              ) : null}
            </div>
          ))
        )}
      </ResidentCard>

      <ResidentCard>
        <ResidentSectionTitle>פרטי קשר</ResidentSectionTitle>
        {!contact.phone && !contact.email ? (
          <ResidentMuted>לא פורסמו פרטי קשר</ResidentMuted>
        ) : (
          <div style={{ fontSize: 15 }}>
            {contact.phone ? <div>טלפון: {contact.phone}</div> : null}
            {contact.email ? <div>דוא״ל: {contact.email}</div> : null}
          </div>
        )}
      </ResidentCard>

      <ResidentCard>
        <ResidentSectionTitle>חיפוש בעל מקצוע במידרג</ResidentSectionTitle>
        <ResidentMuted style={{ marginBottom: 8 }}>
          נפתח אתר מידרג בלשונית חדשה. אין הזמנה או אישור זמינות דרך BINO.
        </ResidentMuted>
        <label style={residentShellStyles.label}>מקצוע</label>
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
        <ResidentMuted style={{ marginBottom: 8 }}>עיר הפרויקט: {city || 'לא הוגדרה'}</ResidentMuted>
        {midrag.href ? (
          <ResidentPrimaryButton href={midrag.href}>
            {midrag.needsCityPicker ? 'בחירת עיר במידרג' : 'חיפוש במידרג'}
          </ResidentPrimaryButton>
        ) : null}
      </ResidentCard>
    </div>
  )
}
