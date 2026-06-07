'use client'

/**
 * מסך החתמה — סריקת QR בכניסה למשרד, בחירת שם, כניסה/יציאה + GPS.
 */
import { Suspense, useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { formatOfficeClockTime } from '@/lib/office-attendance'
import { useClientBranding } from '@/app/components/ClientBrandingContext'
import { theme } from '@/app/components/ui'

const STATION_STORAGE_KEY = 'bamakor_office_station_token'

type StaffOption = {
  id: string
  full_name: string
  is_clocked_in: boolean
  open_clock_in_at: string | null
}

function readGeo(): Promise<{ lat: number; lng: number; accuracy_m: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  })
}

function ScanPageInner() {
  const searchParams = useSearchParams()
  const { displayName, logoUrl } = useClientBranding()
  const [stationToken, setStationToken] = useState('')

  const [loading, setLoading] = useState(true)
  const [clientName, setClientName] = useState('')
  const [staff, setStaff] = useState<StaffOption[]>([])
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [geoWarn, setGeoWarn] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [showGuestForm, setShowGuestForm] = useState(false)

  useEffect(() => {
    const fromUrl = (searchParams.get('st') || '').trim().toLowerCase()
    if (fromUrl) {
      try {
        sessionStorage.setItem(STATION_STORAGE_KEY, fromUrl)
      } catch {}
      setStationToken(fromUrl)
      return
    }
    try {
      setStationToken(sessionStorage.getItem(STATION_STORAGE_KEY) || '')
    } catch {
      setStationToken('')
    }
  }, [searchParams])

  const loadStation = useCallback(async () => {
    if (!stationToken) {
      setError('קישור לא תקין — סרקו שוב את ה-QR בכניסה למשרד')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetchWithTimeout(
        `/api/attendance/station?st=${encodeURIComponent(stationToken)}`,
        { method: 'GET' }
      )
      const body = (await res.json()) as {
        error?: string
        client_name?: string
        staff?: StaffOption[]
      }
      if (!res.ok) throw new Error(body.error || 'שגיאה בטעינה')
      setClientName(body.client_name || '')
      setStaff(body.staff || [])
      if ((body.staff || []).length === 0) {
        setError('עדיין לא הוגדרו שמות להחתמה. המנהלת: חתמת עובדים → «ייבא מעובדים» או הוספת שם.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [stationToken])

  useEffect(() => {
    if (stationToken) void loadStation()
  }, [loadStation, stationToken])

  async function clockAs(staffId: string | null, nameForGuest: string | null) {
    if (!stationToken || busyId) return
    setBusyId(staffId ?? 'guest')
    setSuccessMsg('')
    setError('')
    setGeoWarn(false)
    try {
      if (navigator.vibrate) navigator.vibrate(30)
      const geo = await readGeo()
      const res = await fetchWithTimeout('/api/attendance/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_token: stationToken,
          ...(staffId ? { staff_id: staffId } : { guest_name: nameForGuest }),
          ...(geo ? { lat: geo.lat, lng: geo.lng, accuracy_m: geo.accuracy_m } : {}),
        }),
      })
      const body = (await res.json()) as {
        error?: string
        message?: string
        geofence_warning?: boolean
      }
      if (!res.ok) throw new Error(body.error || 'שגיאה ברישום')
      setSuccessMsg(body.message || 'נרשם בהצלחה')
      setGeoWarn(!!body.geofence_warning)
      setShowSuccess(true)
      window.setTimeout(() => setShowSuccess(false), 2500)
      await loadStation()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה ברישום')
    } finally {
      setBusyId(null)
    }
  }

  async function onPick(member: StaffOption) {
    await clockAs(member.id, null)
  }

  async function onGuestClock() {
    const name = guestName.trim()
    if (!name) {
      setError('נא להזין שם')
      return
    }
    await clockAs(null, name)
    setGuestName('')
    setShowGuestForm(false)
  }

  if (showSuccess && successMsg) {
    return (
      <div style={styles.successScreen} dir="rtl">
        <p style={styles.successText}>{successMsg}</p>
        {geoWarn ? <p style={styles.warnText}>מיקום מחוץ לטווח המשרד — המנהלת תראה זאת</p> : null}
      </div>
    )
  }

  return (
    <div style={styles.page} dir="rtl">
      <div style={styles.card}>
        <div style={styles.brandRow}>
          {logoUrl ? (
            <Image src={logoUrl} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'contain' }} />
          ) : null}
          <div>
            <h1 style={styles.title}>החתמת נוכחות</h1>
            <p style={styles.subtitle}>{displayName || clientName}</p>
          </div>
        </div>
        <p style={styles.hint}>בחרי את שמך — כניסה או יציאה יירשמו אוטומטית</p>

        {loading ? <p style={styles.muted}>טוען…</p> : null}
        {error ? <p style={styles.error}>{error}</p> : null}
        {!loading && successMsg && !showSuccess ? <p style={styles.successInline}>{successMsg}</p> : null}

        {!loading && staff.length > 0 ? (
          <div style={styles.staffList}>
            {staff.map((member) => {
              const isIn = member.is_clocked_in
              const busy = busyId === member.id
              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void onPick(member)}
                  style={{
                    ...styles.staffBtn,
                    minHeight: '56px',
                    ...(isIn ? styles.staffBtnOut : styles.staffBtnIn),
                    opacity: busyId && !busy ? 0.5 : 1,
                  }}
                >
                  <span style={styles.staffName}>{member.full_name}</span>
                  {isIn && member.open_clock_in_at ? (
                    <span style={styles.staffSub}>
                      נכנסת ב-{formatOfficeClockTime(member.open_clock_in_at)}
                    </span>
                  ) : null}
                  <span style={styles.staffAction}>{busy ? 'רושם…' : isIn ? 'יציאה' : 'כניסה'}</span>
                </button>
              )
            })}
          </div>
        ) : null}

        {!loading ? (
          <div style={{ marginTop: 16 }}>
            {!showGuestForm ? (
              <button type="button" style={styles.guestToggle} onClick={() => setShowGuestForm(true)}>
                לא ברשימה? הזינו שם
              </button>
            ) : (
              <div style={styles.guestRow}>
                <input
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="שם מלא"
                  style={styles.guestInput}
                  maxLength={200}
                  autoFocus
                />
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void onGuestClock()}
                  style={styles.guestSubmit}
                >
                  {busyId === 'guest' ? 'רושם…' : 'החתמה'}
                </button>
              </div>
            )}
          </div>
        ) : null}

        <p style={styles.geoNote}>מומלץ לאשר גישה למיקום כשהדפדפן שואל. נדרש אינטרנט בכל החתמה בתחנה זו.</p>
      </div>
    </div>
  )
}

export default function OfficeAttendanceScanPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.page} dir="rtl">
          <p style={styles.muted}>טוען…</p>
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    background: theme.colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    padding: '28px 22px',
    boxShadow: theme.shadows.md,
  },
  brandRow: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '8px' },
  title: { margin: 0, fontSize: '22px', fontWeight: 700, color: theme.colors.textPrimary },
  subtitle: { margin: '4px 0 0', fontSize: '14px', color: theme.colors.textSecondary },
  hint: {
    margin: '12px 0 20px',
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: '14px',
    lineHeight: 1.5,
  },
  staffList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  staffBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '18px 16px',
    borderRadius: theme.radius.md,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  staffBtnIn: { background: theme.colors.primary, color: '#fff' },
  staffBtnOut: { background: '#0d9488', color: '#fff' },
  staffName: { fontSize: '20px', fontWeight: 700 },
  staffSub: { fontSize: '13px', opacity: 0.9 },
  staffAction: { fontSize: '14px', opacity: 0.95 },
  muted: { textAlign: 'center', color: theme.colors.textMuted },
  error: { textAlign: 'center', color: theme.colors.error, marginBottom: '12px', fontSize: '14px' },
  successInline: {
    textAlign: 'center',
    color: '#0d9488',
    marginBottom: '12px',
    fontWeight: 600,
  },
  successScreen: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#0d9488',
  },
  successText: { color: '#fff', fontSize: '22px', fontWeight: 700, textAlign: 'center' },
  warnText: { color: '#fff', fontSize: '14px', marginTop: '12px', textAlign: 'center', opacity: 0.9 },
  geoNote: {
    marginTop: '20px',
    fontSize: '12px',
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 1.45,
  },
  guestToggle: {
    width: '100%',
    padding: '12px',
    border: `1px dashed ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    background: 'transparent',
    color: theme.colors.primary,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  guestRow: { display: 'flex', flexDirection: 'column', gap: '10px' },
  guestInput: {
    width: '100%',
    padding: '14px 12px',
    fontSize: '16px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  guestSubmit: {
    padding: '14px',
    borderRadius: theme.radius.md,
    border: 'none',
    background: theme.colors.primary,
    color: '#fff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
