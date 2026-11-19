'use client'

/**
 * חניונים — Savion PalGate pilot only.
 */
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { toast } from '@/lib/error-handler'
import {
  Button,
  EmptyState,
  KpiCard,
  KpiRow,
  StatusBadge,
  theme,
} from '@/app/components/ui'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
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
    <AddonFeaturePageShell
      title="חניונים"
      mobileSubtitle="פיילוט סביון · PalGate"
      desktopSubtitle="פיילוט סביון — רישום רכבים ופתיחת שער (ממתין לאישור ספק)"
      headerActions={
        <Link href="/settings?tab=connections">
          <Button variant="secondary" size="sm">
            הגדרות חיבור
          </Button>
        </Link>
      }
    >
      {loading ? (
        <PageTransitionLoader />
      ) : (
        <div style={styles.stack}>
          <div
            role="status"
            style={{
              padding: '12px 14px',
              borderRadius: theme.radius.lg,
              border: `1px solid ${theme.colors.warning}`,
              background: theme.colors.warningMuted,
              color: theme.colors.textPrimary,
              fontSize: 13,
              lineHeight: 1.5,
              fontWeight: 600,
            }}
          >
            בתהליך פיתוח — פיילוט סביון בלבד. לא מוצר מוכן לכל הלקוחות; מפתחות ספק בשרת בלבד.
          </div>
          <KpiRow columns={3} isMobile={isMobile}>
            <KpiCard label="רכבים רשומים" value={vehicles.length} />
            <KpiCard
              label="פיילוט"
              value="סביון"
              hint="מוגבל ללקוח הפיילוט"
              accent="primary"
            />
            <KpiCard
              label="חיבור PalGate"
              value={credsOk ? 'מוגדר' : 'ממתין'}
              hint={
                credsOk
                  ? 'אפשר לנסות פתיחת שער'
                  : status?.credentials?.missing?.length
                    ? `חסרים ${status.credentials.missing.length} מפתחות ספק`
                    : 'חסרים מפתחות ספק'
              }
              accent={credsOk ? 'success' : 'warning'}
            />
          </KpiRow>

          <div style={styles.banner}>
            <StatusBadge status={credsOk ? 'ACTIVE' : 'WAITING_PARTS'} />
            <p style={styles.bannerText}>
              ממתינים לאישור PalGate. בינתיים אפשר לרשום רכבים. פתיחת שער בענן כבויה עד אישור +
              Linked Device — פרטים ב«הגדרות → חיבורים».
            </p>
          </div>

          <form onSubmit={onAdd} style={styles.formCard}>
            <h3 style={styles.formTitle}>הוספת רכב</h3>
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
            <div style={styles.formActions}>
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

          {vehicles.length === 0 ? (
            <EmptyState title="אין רכבים עדיין" description="הוסיפו מספר רכב כדי לשמור מזהה לפתיחת שער." />
          ) : (
            <div style={styles.vehicleList}>
              {vehicles.map((v) => (
                <div key={v.id} style={styles.vehicleRow}>
                  <div>
                    <div style={styles.plate} dir="ltr">
                      {v.plate}
                    </div>
                    {v.label ? <div style={styles.vehicleLabel}>{v.label}</div> : null}
                  </div>
                  <div style={styles.formActions}>
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
              ))}
            </div>
          )}
        </div>
      )}
    </AddonFeaturePageShell>
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
  padding: '12px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  fontSize: 16,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  background: theme.colors.surface,
  color: theme.colors.textPrimary,
}

const styles: Record<string, CSSProperties> = {
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
  banner: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  bannerText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.5,
    color: theme.colors.textSecondary,
  },
  formCard: {
    display: 'grid',
    gap: 12,
    padding: 16,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  formTitle: { margin: 0, fontSize: 16, fontWeight: 700 },
  formActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  vehicleList: { display: 'grid', gap: 10 },
  vehicleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: 14,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  plate: { fontWeight: 700, fontSize: 16, letterSpacing: 0.5 },
  vehicleLabel: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
}
