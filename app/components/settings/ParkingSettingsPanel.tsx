'use client'

/**
 * PalGate / parking — status only (credentials live in server env).
 * Shown under Settings → חיבורים for Savion pilot tenants.
 */

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { Button, Card, LoadingSpinner, theme } from '@/app/components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type Creds = {
  configured: boolean
  device_id_set?: boolean
  phone_set?: boolean
  token_set?: boolean
  missing?: string[]
}

export function ParkingSettingsPanel() {
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [creds, setCreds] = useState<Creds | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/parking/status')
      if (res.status === 403) {
        setForbidden(true)
        setCreds(null)
        return
      }
      const json = (await res.json().catch(() => ({}))) as {
        credentials?: Creds
        error?: string
      }
      if (!res.ok) {
        setCreds(null)
        return
      }
      setForbidden(false)
      setCreds(json.credentials ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <Card>
        <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
          <LoadingSpinner />
        </div>
      </Card>
    )
  }

  if (forbidden) {
    return (
      <Card>
        <div style={styles.inner}>
          <h3 style={styles.title}>חניונים / PalGate</h3>
          <p style={styles.hint}>פיילוט חניונים זמין רק ללקוח סביון.</p>
        </div>
      </Card>
    )
  }

  const configured = Boolean(creds?.configured)
  const missing = creds?.missing?.length ? creds.missing.join(', ') : null

  return (
    <Card>
      <div style={styles.inner}>
        <h3 style={styles.title}>חניונים / PalGate</h3>
        <p
          style={{
            margin: 0,
            padding: '10px 12px',
            borderRadius: theme.radius.md,
            background: theme.colors.warningMuted,
            border: `1px solid ${theme.colors.warning}`,
            fontSize: 13,
            fontWeight: 600,
            color: theme.colors.textPrimary,
            lineHeight: 1.45,
          }}
        >
          בתהליך פיתוח — פיילוט סביון בלבד
        </p>
        <p style={styles.hint}>
          מפתחות הגישה מוגדרים בשרת בלבד (לא בטופס זה). כאן רואים רק סטטוס חיבור וקישור לניהול רכבים.
        </p>
        <div style={styles.statusRow}>
          <span
            style={{
              ...styles.pill,
              background: configured ? theme.colors.successMuted : theme.colors.warningMuted,
              color: configured ? theme.colors.success : theme.colors.warning,
            }}
          >
            {configured ? 'מחובר' : 'חסרים מפתחות'}
          </span>
          {missing ? (
            <span style={{ fontSize: 13, color: theme.colors.textMuted }}>חסר: {missing}</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/parking">
            <Button type="button">נהל חניונים</Button>
          </Link>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            רענן סטטוס
          </Button>
        </div>
      </div>
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  inner: {
    padding: '22px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  hint: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 1.5,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: theme.radius.sm,
    fontSize: 12,
    fontWeight: 600,
    border: `1px solid ${theme.colors.borderSubtle}`,
  },
}
