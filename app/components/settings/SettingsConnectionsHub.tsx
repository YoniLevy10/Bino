'use client'

/**
 * Settings → חיבורים — compact status cards for Grow / Financy / WhatsApp / PalGate.
 * Detail forms live in existing tabs; this hub only routes + shows status.
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Button, Card, theme } from '@/app/components/ui'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { useSidebarNav } from '@/app/components/SidebarNavContext'

export type ConnectionDetailTab = 'whatsapp' | 'grow' | 'financy' | 'parking'

type ConnState = 'connected' | 'partial' | 'missing'

type Props = {
  whatsappPhoneNumberId: string
  whatsappTokenSet: boolean
  growEnabled: boolean
  growUserId: string
  growOnboardStatus: string | null
  onOpenDetail: (tab: ConnectionDetailTab) => void
}

function statePill(state: ConnState) {
  const map = {
    connected: {
      label: 'מחובר',
      bg: theme.colors.successMuted,
      color: theme.colors.success,
    },
    partial: {
      label: 'חלקי',
      bg: theme.colors.warningMuted,
      color: theme.colors.warning,
    },
    missing: {
      label: 'לא הוגדר',
      bg: theme.colors.muted,
      color: theme.colors.textMuted,
    },
  } as const
  const c = map[state]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: theme.radius.sm,
        fontSize: 11,
        fontWeight: 700,
        background: c.bg,
        color: c.color,
        border: `1px solid ${theme.colors.borderSubtle}`,
      }}
    >
      {c.label}
    </span>
  )
}

function ConnectionCard({
  title,
  description,
  state,
  cta,
  onClick,
  icon,
}: {
  title: string
  description: string
  state: ConnState
  cta: string
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button type="button" onClick={onClick} style={styles.cardBtn}>
      <div style={styles.cardTop}>
        <span style={styles.iconWrap} aria-hidden>
          {icon}
        </span>
        {statePill(state)}
      </div>
      <div style={styles.cardTitle}>{title}</div>
      <p style={styles.cardDesc}>{description}</p>
      <span style={styles.cta}>{cta}</span>
    </button>
  )
}

export function SettingsConnectionsHub({
  whatsappPhoneNumberId,
  whatsappTokenSet,
  growEnabled,
  growUserId,
  growOnboardStatus,
  onOpenDetail,
}: Props) {
  const { orderIds } = useSidebarNav()
  const showParking = orderIds.includes('parking')

  const [parkingState, setParkingState] = useState<ConnState | null>(null)
  const [financyState, setFinancyState] = useState<ConnState>('missing')

  const loadExtras = useCallback(async () => {
    try {
      const finRes = await fetchWithTimeout('/api/building-finance/bank/status')
      if (finRes.ok) {
        const json = (await finRes.json().catch(() => ({}))) as {
          configured?: boolean
          enabled?: boolean
        }
        if (json.enabled && json.configured) setFinancyState('connected')
        else if (json.configured || json.enabled) setFinancyState('partial')
        else setFinancyState('missing')
      }
    } catch {
      /* keep missing */
    }

    if (!showParking) {
      setParkingState(null)
      return
    }
    try {
      const res = await fetchWithTimeout('/api/parking/status')
      if (res.status === 403) {
        setParkingState(null)
        return
      }
      if (!res.ok) {
        setParkingState('missing')
        return
      }
      const json = (await res.json().catch(() => ({}))) as {
        credentials?: { configured?: boolean; missing?: string[] }
      }
      if (json.credentials?.configured) setParkingState('connected')
      else if (json.credentials?.missing?.length) setParkingState('partial')
      else setParkingState('missing')
    } catch {
      setParkingState('missing')
    }
  }, [showParking])

  useEffect(() => {
    void loadExtras()
  }, [loadExtras])

  const waState: ConnState =
    whatsappPhoneNumberId.trim() && whatsappTokenSet
      ? 'connected'
      : whatsappPhoneNumberId.trim() || whatsappTokenSet
        ? 'partial'
        : 'missing'

  const growState: ConnState =
    growEnabled && growUserId.trim()
      ? 'connected'
      : growUserId.trim() || growOnboardStatus
        ? 'partial'
        : 'missing'

  return (
    <div style={styles.wrap}>
      <Card>
        <div style={styles.intro}>
          <h2 style={styles.introTitle}>מרכז חיבורים</h2>
          <p style={styles.introHint}>
            במבט אחד: מה מחובר ומה חסר כדי להפעיל גבייה, בנק, וואטסאפ
            {showParking ? ' וחניון' : ''}. לחצו על כרטיס כדי להמשיך הגדרה.
          </p>
        </div>
      </Card>

      <div style={styles.grid}>
        <ConnectionCard
          title="WhatsApp"
          description="הטמעה, מספר עסקי וטוקן Meta"
          state={waState}
          cta={waState === 'connected' ? 'נהל' : 'המשך הגדרה'}
          onClick={() => onOpenDetail('whatsapp')}
          icon="WA"
        />
        <ConnectionCard
          title="Grow"
          description="גביית ועד בית — קישור תשלום וחשבוניות"
          state={growState}
          cta={growState === 'connected' ? 'נהל' : 'חבר'}
          onClick={() => onOpenDetail('grow')}
          icon="G"
        />
        <ConnectionCard
          title="Financy"
          description="בנק וספרים — מפתחות API מ־Financy"
          state={financyState}
          cta={financyState === 'connected' ? 'נהל' : 'חבר'}
          onClick={() => onOpenDetail('financy')}
          icon="F"
        />
        {parkingState !== null ? (
          <ConnectionCard
            title="PalGate / חניונים"
            description="סטטוס מפתחות שרת וניהול רכבים"
            state={parkingState}
            cta={parkingState === 'connected' ? 'נהל' : 'בדוק סטטוס'}
            onClick={() => onOpenDetail('parking')}
            icon="P"
          />
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button type="button" variant="secondary" size="sm" onClick={() => void loadExtras()}>
          רענן סטטוסים
        </Button>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  intro: {
    padding: '18px 20px',
  },
  introTitle: {
    margin: '0 0 6px',
    fontSize: 17,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  introHint: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 1.5,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 12,
  },
  cardBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    padding: '16px 16px 14px',
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    cursor: 'pointer',
    textAlign: 'start',
    fontFamily: 'inherit',
    boxShadow: theme.shadows.xs,
    transition: `border-color ${theme.motion.fast} ease, box-shadow ${theme.motion.fast} ease`,
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    background: theme.colors.blueSoft,
    color: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 800,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  cardDesc: {
    margin: 0,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 1.45,
    flex: 1,
  },
  cta: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.primary,
    marginTop: 4,
  },
}
