'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { AddonFeaturePreview } from '@/app/components/addons/AddonFeaturePreview'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'
import { LEVY_TECH_BRAND } from '@/lib/addons-nav'
import {
  getLockedPaidAddons,
  type PaidAddonCatalogEntry,
} from '@/lib/paid-addons-catalog'
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

function AddonCard({ entry }: { entry: PaidAddonCatalogEntry }) {
  return (
    <article style={styles.card}>
      <AddonFeaturePreview addonId={entry.id} />
      <div style={styles.cardBody}>
        <h3 style={styles.cardTitle}>{entry.title}</h3>
        <p style={styles.cardTagline}>{entry.tagline}</p>
        <p style={styles.cardDesc}>{entry.description}</p>
        <ul style={styles.highlights}>
          {entry.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}

function AddonsPageInner() {
  const searchParams = useSearchParams()
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lockedAddons, setLockedAddons] = useState<PaidAddonCatalogEntry[]>([])
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
        setLockedAddons(getLockedPaidAddons(enabled))
      } catch {
        setLockedAddons([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
              התוספים הבאים אינם פעילים בחשבון שלכם. ניתן לצפות במה שהם כוללים — להפעלה נא לפנות להנהלה.
            </p>
            <p style={styles.contact}>
              ליצירת קשר והפעלה: <strong>הנהלת {LEVY_TECH_BRAND}</strong>
            </p>

            {loading ? (
              <p style={styles.muted}>טוען...</p>
            ) : lockedAddons.length === 0 ? (
              <div style={styles.allActive}>
                <p style={styles.muted}>כל התוספים בחשבון שלכם פעילים.</p>
              </div>
            ) : (
              <div style={styles.grid}>
                {lockedAddons.map((entry) => (
                  <AddonCard key={entry.id} entry={entry} />
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
    maxWidth: '960px',
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
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    overflow: 'hidden',
  },
  cardBody: {
    padding: '16px 18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  cardTitle: {
    margin: 0,
    fontSize: '17px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  cardTagline: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.primary,
  },
  cardDesc: {
    margin: 0,
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: 1.55,
  },
  highlights: {
    margin: '4px 0 0',
    paddingInlineStart: 18,
    fontSize: '12px',
    color: theme.colors.textMuted,
    lineHeight: 1.5,
  },
}
