'use client'

/**
 * חניונים — Savion PalGate pilot only.
 * Add a vehicle plate / identifier, then open the home gate via PalGate cloud.
 */
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { toast } from '@/lib/error-handler'
import {
  MobileHeader,
  useMobileMenu,
  PageHeader,
  Card,
  Button,
  EmptyState,
  theme,
} from '@/app/components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { PageTransitionLoader } from '@/app/components/page-skeleton'

type Vehicle = {
  id: string
  plate: string
  label: string | null
  created_at: string
}

type StatusPayload = {
  pilot?: boolean
  credentials?: {
    configured: boolean
    missing: string[]
  }
}

export default function ParkingPage() {
  const { openMenu } = useMobileMenu()
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [plate, setPlate] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [openingLoose, setOpeningLoose] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, vehiclesRes] = await Promise.all([
        fetchWithTimeout('/api/parking/status'),
        fetchWithTimeout('/api/parking/vehicles'),
      ])
      if (statusRes.status === 403 || vehiclesRes.status === 403) {
        toast.error('פיילוט חניונים זמין רק ללקוח סביון')
        setVehicles([])
        setStatus(null)
        return
      }
      const statusJson = (await statusRes.json().catch(() => ({}))) as StatusPayload & {
        error?: string
      }
      const vehiclesJson = (await vehiclesRes.json().catch(() => ({}))) as {
        vehicles?: Vehicle[]
        error?: string
      }
      if (!statusRes.ok) throw new Error(statusJson.error || 'שגיאה בסטטוס')
      if (!vehiclesRes.ok) throw new Error(vehiclesJson.error || 'שגיאה בטעינת רכבים')
      setStatus(statusJson)
      setVehicles(vehiclesJson.vehicles || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בטעינה')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!plate.trim()) {
      toast.error('הזינו מספר רכב או מזהה')
      return
    }
    setSaving(true)
    try {
      const res = await fetchWithTimeout('/api/parking/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: plate.trim(), label: label.trim() || null }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; vehicle?: Vehicle }
      if (!res.ok) throw new Error(json.error || 'שמירה נכשלה')
      setPlate('')
      setLabel('')
      toast.success('הרכב נשמר')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    try {
      const res = await fetchWithTimeout(`/api/parking/vehicles/${id}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'מחיקה נכשלה')
      toast.success('נמחק')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'מחיקה נכשלה')
    }
  }

  async function onOpen(vehicle?: Vehicle) {
    if (vehicle) setOpeningId(vehicle.id)
    else setOpeningLoose(true)
    try {
      const res = await fetchWithTimeout('/api/parking/open-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          vehicle ? { vehicle_id: vehicle.id } : plate.trim() ? { plate: plate.trim() } : {}
        ),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
      if (!res.ok) throw new Error(json.error || 'פתיחת שער נכשלה')
      toast.success(vehicle ? `השער נפתח עבור ${vehicle.plate}` : 'השער נפתח')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'פתיחת שער נכשלה')
    } finally {
      setOpeningId(null)
      setOpeningLoose(false)
    }
  }

  const credsOk = Boolean(status?.credentials?.configured)

  return (
    <div style={{ paddingBottom: isMobile ? 88 : 32 }}>
      {isMobile ? (
        <MobileHeader title="חניונים" onMenuClick={openMenu} />
      ) : (
        <PageHeader title="חניונים" subtitle="פיילוט סביון — מספר רכב ופתיחת שער PalGate" />
      )}

      <div style={{ padding: isMobile ? '12px 16px' : '0 0 24px', maxWidth: 720, margin: '0 auto' }}>
        {loading ? (
          <PageTransitionLoader />
        ) : (
          <>
            <Card style={{ marginBottom: 16, padding: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: theme.colors.textSecondary, lineHeight: 1.5 }}>
                הוסיפו מספר רכב (או מזהה), ואז פתחו את השער מהמערכת. הפיילוט פעיל רק בלקוח סביון.
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: credsOk ? theme.colors.success : theme.colors.warning,
                  fontWeight: 600,
                }}
              >
                {credsOk
                  ? 'חיבור PalGate מוגדר בשרת'
                  : `חסרים משתני סביבה: ${(status?.credentials?.missing || []).join(', ') || 'לא ידוע'}`}
              </p>
            </Card>

            <Card style={{ marginBottom: 16, padding: 16 }}>
              <form onSubmit={onAdd} style={{ display: 'grid', gap: 12 }}>
                <label style={labelStyle}>
                  מספר רכב / מזהה
                  <input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    placeholder="לדוגמה 12-345-67"
                    dir="ltr"
                    style={inputStyle}
                    maxLength={40}
                    autoComplete="off"
                  />
                </label>
                <label style={labelStyle}>
                  תווית (אופציונלי)
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="רכב בית / אורח"
                    style={inputStyle}
                    maxLength={80}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'שומר…' : 'הוסף רכב'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={openingLoose || !credsOk}
                    onClick={() => void onOpen()}
                  >
                    {openingLoose ? 'פותח שער…' : 'פתח שער עכשיו'}
                  </Button>
                </div>
              </form>
            </Card>

            {vehicles.length === 0 ? (
              <EmptyState title="אין רכבים עדיין" description="הוסיפו מספר רכב כדי לשמור מזהה לפתיחת שער." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {vehicles.map((v) => (
                  <Card key={v.id} style={{ padding: 14 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.5 }} dir="ltr">
                          {v.plate}
                        </div>
                        {v.label ? (
                          <div style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 2 }}>
                            {v.label}
                          </div>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          type="button"
                          disabled={openingId === v.id || !credsOk}
                          onClick={() => void onOpen(v)}
                        >
                          {openingId === v.id ? 'פותח…' : 'פתח שער'}
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => void onDelete(v.id)}>
                          מחק
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const labelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: theme.colors.textPrimary,
}

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  fontSize: 15,
  width: '100%',
  boxSizing: 'border-box',
}
