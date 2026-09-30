'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Props = { projectId: string }

export function ResidentPortalAdminPanel({ projectId }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [city, setCity] = useState('')
  const [policy, setPolicy] = useState('midrag_search')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [residentId, setResidentId] = useState('')
  const [residents, setResidents] = useState<Array<{ id: string; full_name: string; apartment_number: string | null }>>([])
  const [acceptUrl, setAcceptUrl] = useState('')
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [amenityName, setAmenityName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [memberships, setMemberships] = useState<Array<{ id: string; status: string; residents?: { full_name?: string } | null }>>([])

  const load = useCallback(async () => {
    setError('')
    const [settingsRes, invitesRes] = await Promise.all([
      fetch(`/api/projects/resident-portal/settings?project_id=${projectId}`),
      fetch(`/api/projects/resident-portal/invites?project_id=${projectId}`),
    ])
    const settings = await settingsRes.json()
    const invites = await invitesRes.json()
    if (!settingsRes.ok) throw new Error(settings.error || 'טעינת הגדרות נכשלה')
    if (!invitesRes.ok) throw new Error(invites.error || 'טעינת הזמנות נכשלה')
    setEnabled(Boolean(settings.project?.resident_portal_enabled))
    setCity(settings.project?.city || '')
    setPolicy(settings.project?.resident_portal_private_ticket_policy || 'midrag_search')
    setContactPhone(settings.project?.resident_portal_contact_phone || '')
    setContactEmail(settings.project?.resident_portal_contact_email || '')
    setMemberships(invites.memberships || [])
    setResidents(
      ((settings.residents || []) as Array<{
        id: string
        full_name: string
        apartment_number: string | null
      }>).map((r) => ({
        id: r.id,
        full_name: r.full_name,
        apartment_number: r.apartment_number,
      }))
    )
  }, [projectId])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
  }, [load])

  async function saveSettings(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    const res = await fetch('/api/projects/resident-portal/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        resident_portal_enabled: enabled,
        city,
        resident_portal_private_ticket_policy: policy,
        resident_portal_contact_phone: contactPhone,
        resident_portal_contact_email: contactEmail,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'שמירה נכשלה')
      return
    }
    setMessage('ההגדרות נשמרו')
  }

  async function createInvite(e: FormEvent) {
    e.preventDefault()
    setAcceptUrl('')
    setError('')
    const res = await fetch('/api/projects/resident-portal/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        resident_id: residentId,
        email: inviteEmail,
        role: 'owner',
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'יצירת הזמנה נכשלה')
      return
    }
    setAcceptUrl(json.acceptUrl || '')
    setMessage('הזמנה נוצרה — העתיקו את הקישור לדייר')
    await load()
  }

  async function publishAnnouncement(e: FormEvent) {
    e.preventDefault()
    setError('')
    const res = await fetch('/api/projects/resident-portal/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        title: annTitle,
        body: annBody,
        status: 'published',
        is_pinned: true,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'פרסום נכשל')
      return
    }
    setAnnTitle('')
    setAnnBody('')
    setMessage('הודעה פורסמה בפורטל')
  }

  async function createAmenity(e: FormEvent) {
    e.preventDefault()
    setError('')
    const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day_of_week: day,
      opens_at: '07:00',
      closes_at: '21:00',
      is_closed: day === 6,
    }))
    const res = await fetch('/api/projects/resident-portal/amenities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        name: amenityName,
        hours,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'יצירת מתקן נכשלה')
      return
    }
    setAmenityName('')
    setMessage('מתקן נוסף עם שעות בסיס (שבת סגור)')
  }

  async function revoke(membershipId: string) {
    if (!confirm('לבטל גישה לדייר זה?')) return
    const res = await fetch(
      `/api/projects/resident-portal/invites?membership_id=${membershipId}`,
      { method: 'DELETE' }
    )
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'ביטול נכשל')
      return
    }
    setMessage('הגישה בוטלה')
    await load()
  }

  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        border: '1px solid #E8E8ED',
        borderRadius: 16,
        background: '#fff',
      }}
    >
      <h2 style={{ marginTop: 0 }}>פורטל דיירים</h2>
      <p style={{ color: '#86868B', fontSize: 14 }}>
        הפעלה לפיילוט לבניין/פרויקט אחד לפני הרחבה. דיירים לא מתווספים ל־organization_users.
      </p>
      {error ? (
        <div role="alert" style={{ color: '#FF3B30', marginBottom: 8 }}>
          {error}
        </div>
      ) : null}
      {message ? (
        <div role="status" style={{ color: '#16a34a', marginBottom: 8 }}>
          {message}
        </div>
      ) : null}

      <form onSubmit={saveSettings} style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{' '}
          פורטל דיירים מופעל
        </label>
        <label>
          עיר (למידרג)
          <input value={city} onChange={(e) => setCity(e.target.value)} style={input} />
        </label>
        <label>
          מדיניות תקלה פרטית
          <select value={policy} onChange={(e) => setPolicy(e.target.value)} style={input}>
            <option value="midrag_search">חיפוש במידרג</option>
            <option value="contact_only">הפניה לאיש קשר בלבד</option>
            <option value="disabled">ללא</option>
          </select>
        </label>
        <label>
          טלפון ליצירת קשר
          <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={input} />
        </label>
        <label>
          דוא״ל ליצירת קשר
          <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={input} />
        </label>
        <button type="submit" style={btn}>
          שמירת הגדרות
        </button>
      </form>

      <form onSubmit={createInvite} style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        <h3>הזמנת דייר</h3>
        <label>
          מזהה דייר (UUID) / בחירה
          <input
            list="portal-residents"
            value={residentId}
            onChange={(e) => setResidentId(e.target.value)}
            style={input}
            required
          />
          <datalist id="portal-residents">
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
                {r.apartment_number ? ` · דירה ${r.apartment_number}` : ''}
              </option>
            ))}
          </datalist>
        </label>
        <label>
          דוא״ל מאומת להזמנה
          <input
            type="email"
            required
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={input}
          />
        </label>
        <button type="submit" style={btn}>
          יצירת קישור הזמנה
        </button>
        {acceptUrl ? (
          <textarea readOnly value={acceptUrl} rows={3} style={{ ...input, fontSize: 12 }} />
        ) : null}
      </form>

      <div style={{ marginBottom: 20 }}>
        <h3>חברויות פעילות</h3>
        {memberships.filter((m) => m.status === 'active').length === 0 ? (
          <p style={{ color: '#86868B' }}>אין חברויות פעילות</p>
        ) : (
          memberships
            .filter((m) => m.status === 'active')
            .map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <span>{m.residents?.full_name || m.id}</span>
                <button type="button" onClick={() => void revoke(m.id)}>
                  ביטול גישה
                </button>
              </div>
            ))
        )}
      </div>

      <form onSubmit={publishAnnouncement} style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
        <h3>הודעה לדיירים</h3>
        <input
          placeholder="כותרת"
          value={annTitle}
          onChange={(e) => setAnnTitle(e.target.value)}
          style={input}
          required
        />
        <textarea
          placeholder="תוכן"
          value={annBody}
          onChange={(e) => setAnnBody(e.target.value)}
          rows={3}
          style={input}
        />
        <button type="submit" style={btn}>
          פרסום מיידי
        </button>
      </form>

      <form onSubmit={createAmenity} style={{ display: 'grid', gap: 8 }}>
        <h3>מתקן + שעות בסיס</h3>
        <input
          placeholder="שם מתקן (למשל בריכה)"
          value={amenityName}
          onChange={(e) => setAmenityName(e.target.value)}
          style={input}
          required
        />
        <button type="submit" style={btn}>
          הוספת מתקן
        </button>
      </form>

      <p style={{ fontSize: 13, color: '#86868B', marginTop: 16 }}>
        מסמכים: פרסמו ממסך מסמכי הפרויקט דרך{' '}
        <code>/api/projects/resident-portal/documents/publish</code>. גבייה: השתמשו במסך הגבייה הקיים
        (חיוב בסטטוס נשלח מפורסם אוטומטית לפורטל).
      </p>
    </section>
  )
}

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 40,
  marginTop: 4,
  padding: '8px 10px',
  fontSize: 15,
  borderRadius: 8,
  border: '1px solid #D1D1D6',
}
const btn: React.CSSProperties = {
  minHeight: 44,
  border: 'none',
  borderRadius: 10,
  background: '#007AFF',
  color: '#fff',
  fontWeight: 700,
}
