'use client'

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'
import {
  getGenericAddonSlotLabels,
  getLockedAddonsCount,
  LEVY_TECH_BRAND,
} from '@/lib/addons-nav'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { toast } from '@/lib/error-handler'
import {
  AppShell,
  Card,
  MobileHeader,
  MobileMenu,
  PageHeader,
  theme,
} from '../components/ui'

function LockIcon({ size = 32 }: { size?: number }) {
  const color = theme.colors.textMuted
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="14" height="10" x="5" y="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function AddonsPageInner() {
  const searchParams = useSearchParams()
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lockedCount, setLockedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (searchParams.get('blocked') === '1') {
      toast.info(`פיצ'ר בתשלום. ליצירת קשר: הנהלת ${LEVY_TECH_BRAND}.`)
    }
  }, [searchParams])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const res = await fetchWithTimeout('/api/client/nav-config')
        const json = (await res.json()) as { enabled_nav_features?: unknown }
        if (!res.ok) throw new Error('nav-config failed')
        const enabled = parseEnabledNavFeaturesFromDb(json.enabled_nav_features)
        setLockedCount(getLockedAddonsCount(enabled))
      } catch {
        setLockedCount(0)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const slotLabels = useMemo(() => getGenericAddonSlotLabels(lockedCount), [lockedCount])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="תוספים" subtitle="הרחבות לחשבון" onMenuClick={() => setMenuOpen(true)} />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={styles.content}>
        {!isMobile && <PageHeader title="תוספים" subtitle="הרחבות זמינות לחשבון" />}

        <Card noPadding>
          <div style={styles.cardInner}>
            <p style={styles.lead}>
              חלק מהתוספים בחשבון שלכם אינם פעילים כרגע. אין גישה לפרטים נוספים עד להפעלה.
            </p>
            <p style={styles.contact}>
              ליצירת קשר והפעלה: <strong>הנהלת {LEVY_TECH_BRAND}</strong>
            </p>

            {loading ? (
              <p style={styles.muted}>טוען...</p>
            ) : lockedCount === 0 ? (
              <div style={styles.allActive}>
                <p style={styles.muted}>כל התוספים בחשבון שלכם פעילים.</p>
              </div>
            ) : (
              <div style={styles.grid}>
                {slotLabels.map((label) => (
                  <div key={label} style={styles.slot}>
                    <LockIcon size={28} />
                    <div style={styles.slotTitle}>{label}</div>
                    <div style={styles.slotBadge}>פיצ&apos;ר בתשלום</div>
                    <p style={styles.slotHint}>פרטים זמינים לאחר הפעלה על ידי הנהלה</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

export default function AddonsPage() {
  return (
    <Suspense fallback={null}>
      <AddonsPageInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '24px 40px',
    maxWidth: '900px',
  },
  cardInner: {
    padding: '28px',
  },
  lead: {
    margin: '0 0 12px',
    fontSize: '15px',
    color: theme.colors.textPrimary,
    lineHeight: 1.6,
  },
  contact: {
    margin: '0 0 28px',
    fontSize: '15px',
    color: theme.colors.textSecondary,
    lineHeight: 1.6,
  },
  muted: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textMuted,
  },
  allActive: {
    padding: '24px',
    textAlign: 'center',
    background: theme.colors.successMuted,
    borderRadius: theme.radius.md,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '16px',
  },
  slot: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '8px',
    padding: '20px 16px',
    borderRadius: theme.radius.lg,
    border: `1px dashed ${theme.colors.borderStrong}`,
    background: theme.colors.muted,
  },
  slotTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  slotBadge: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.colors.warning,
    background: theme.colors.warningMuted,
    padding: '4px 10px',
    borderRadius: theme.radius.full,
  },
  slotHint: {
    margin: 0,
    fontSize: '12px',
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
}
