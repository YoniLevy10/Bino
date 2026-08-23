'use client'

import Link from 'next/link'
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { AddonFeaturePreview } from '@/app/components/addons/AddonFeaturePreview'
import { AddonMarketingModal } from '@/app/components/addons/AddonMarketingModal'
import { AddonSidebarPinButton } from '@/app/components/addons/AddonSidebarPinButton'
import { BAMAKOR_BRAND } from '@/lib/addons-nav'
import { formatAddonPriceDisplay } from '@/lib/paid-addons'
import {
  buildPaidAddonsForDisplay,
  type PaidAddonDisplayEntry,
  type PaidAddonId,
} from '@/lib/paid-addons-catalog'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { toast } from '@/lib/error-handler'
import {
  AppShell,
  Card,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  theme,
} from '../components/ui'
import { PageTransitionLoader } from '../components/page-skeleton'
import { usePaidAddons } from '../components/PaidAddonsContext'

function AddonCard({
  entry,
  onOpen,
  hovered,
  onHover,
}: {
  entry: PaidAddonDisplayEntry
  onOpen: (entry: PaidAddonDisplayEntry) => void
  hovered: boolean
  onHover: (id: PaidAddonId | null) => void
}) {
  return (
    <button
      type="button"
      style={styles.cardButton}
      onClick={() => onOpen(entry)}
      onMouseEnter={() => onHover(entry.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(entry.id)}
      onBlur={() => onHover(null)}
      aria-label={`פרטים על ${entry.title}`}
    >
      <article
        style={{
          ...styles.card,
          ...(hovered
            ? {
                borderColor: theme.colors.primary,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              }
            : {}),
        }}
      >
        <AddonFeaturePreview addonId={entry.id} locked={entry.locked} />
        <div style={styles.cardBody}>
          <div style={styles.cardTopRow}>
            {entry.locked ? (
              <span style={styles.lockedBadge}>נעול · בתשלום</span>
            ) : (
              <span style={styles.activeBadge}>פתוח</span>
            )}
            <span style={styles.priceChip}>{formatAddonPriceDisplay(entry.price_ils_monthly)}</span>
          </div>
          <h3 style={styles.cardTitle}>{entry.title}</h3>
          <p style={styles.cardTagline}>{entry.tagline}</p>
          <p style={styles.cardDesc}>{entry.description}</p>
          <ul style={styles.highlights}>
            {entry.highlights.slice(0, 2).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          {entry.locked ? (
            <span style={styles.tapHint}>לחצו לפרטים והסבר מלא</span>
          ) : (
            <div style={styles.cardActions}>
              <Link
                href={entry.featureHref}
                style={styles.openLink}
                onClick={(e) => e.stopPropagation()}
              >
                {entry.featureCtaHe} ←
              </Link>
              <AddonSidebarPinButton entry={entry} compact />
            </div>
          )}
        </div>
      </article>
    </button>
  )
}

function AddonsPageInner() {
  const searchParams = useSearchParams()
  const { openMenu } = useMobileMenu()
  const [isMobile, setIsMobile] = useState(false)
  const [marketingEntry, setMarketingEntry] = useState<PaidAddonDisplayEntry | null>(null)
  const [hoveredId, setHoveredId] = useState<PaidAddonId | null>(null)
  const { isBootstrapped, catalogMissing, addons: entitlements } = usePaidAddons()

  const addons = useMemo(
    () => (isBootstrapped ? buildPaidAddonsForDisplay(entitlements) : []),
    [isBootstrapped, entitlements]
  )

  const stats = useMemo(() => {
    const active = addons.filter((a) => !a.locked).length
    const locked = addons.length - active
    return { active, locked, total: addons.length }
  }, [addons])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (searchParams.get('blocked') === '1') {
      toast.info(`פיצ'ר בתשלום. ליצירת קשר: הנהלת ${BAMAKOR_BRAND}.`)
    }
  }, [searchParams])

  const loading = !isBootstrapped

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="תוספים" subtitle="הרחבות לחשבון" onMenuClick={openMenu} />
      )}

      <div
        style={{
          ...styles.content,
          ...(isMobile ? { padding: '16px 16px 32px', maxWidth: '100%', boxSizing: 'border-box' } : {}),
        }}
      >
        {!isMobile && (
          <PageHeader title="תוספים בתשלום" subtitle="הרחבות לחשבון — לחצו על כרטיס לפרטים מלאים" />
        )}

        {!loading && !catalogMissing && addons.length > 0 && (
          <div style={styles.statsRow}>
            <div style={styles.statChip}>
              <span style={styles.statValue}>{stats.total}</span>
              <span style={styles.statLabel}>תוספים בקטלוג</span>
            </div>
            <div style={{ ...styles.statChip, background: theme.colors.successMuted }}>
              <span style={{ ...styles.statValue, color: theme.colors.success }}>{stats.active}</span>
              <span style={styles.statLabel}>פעילים</span>
            </div>
            <div style={{ ...styles.statChip, background: theme.colors.warningMuted }}>
              <span style={{ ...styles.statValue, color: theme.colors.warning }}>{stats.locked}</span>
              <span style={styles.statLabel}>לרכישה</span>
            </div>
          </div>
        )}

        <div style={styles.heroBanner}>
          <p style={styles.heroText}>
            הרחיבו את המערכת עם יכולות מתקדמות. כל כרטיס מציג תצוגה מקדימה — תוסף לא פעיל מוצג עם מנעול.
            לחצו על כרטיס לקריאת ההסבר המלא.
          </p>
          <p style={styles.heroContact}>
            להפעלה: <strong>הנהלת {BAMAKOR_BRAND}</strong>
          </p>
        </div>

        {loading ? (
          <PageTransitionLoader />
        ) : catalogMissing ? (
          <Card>
            <p style={styles.muted}>
              מערכת התוספים טרם הופעלה בשרת. הריצו מיגרציות <code>046_paid_addons.sql</code>,
              <code>048_worker_stamp_paid_addon.sql</code> ו-<code>050_paid_addons_full_catalog.sql</code>.
            </p>
          </Card>
        ) : addons.length === 0 ? (
          <Card>
            <p style={styles.muted}>אין תוספים במחירון כרגע.</p>
          </Card>
        ) : (
          <div style={styles.grid}>
            {addons.map((entry) => (
              <AddonCard
                key={entry.id}
                entry={entry}
                onOpen={setMarketingEntry}
                hovered={hoveredId === entry.id}
                onHover={setHoveredId}
              />
            ))}
          </div>
        )}
      </div>

      <AddonMarketingModal
        open={marketingEntry != null}
        entry={marketingEntry}
        isMobile={isMobile}
        onClose={() => setMarketingEntry(null)}
      />
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
    padding: '24px 40px 48px',
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
  },
  statChip: {
    padding: '14px 16px',
    borderRadius: theme.radius.lg,
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statValue: {
    fontSize: '22px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.1,
  },
  statLabel: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    fontWeight: 600,
  },
  heroBanner: {
    padding: '18px 20px',
    borderRadius: theme.radius.lg,
    background: `linear-gradient(135deg, ${theme.colors.primaryMuted} 0%, ${theme.colors.surface} 55%)`,
    border: `1px solid ${theme.colors.border}`,
  },
  heroText: {
    margin: 0,
    fontSize: '15px',
    color: theme.colors.textPrimary,
    lineHeight: 1.65,
  },
  heroContact: {
    margin: '10px 0 0',
    fontSize: '14px',
    color: theme.colors.textSecondary,
  },
  muted: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textMuted,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 20,
  },
  lockedBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: theme.radius.full,
    background: theme.colors.warningMuted,
    color: theme.colors.warning,
  },
  activeBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: theme.radius.full,
    background: theme.colors.successMuted,
    color: theme.colors.success,
  },
  priceChip: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.textMuted,
  },
  cardButton: {
    display: 'block',
    width: '100%',
    padding: 0,
    margin: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'inherit',
    font: 'inherit',
    color: 'inherit',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    overflow: 'hidden',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  cardBody: {
    padding: '14px 16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tapHint: {
    fontSize: '11px',
    fontWeight: 600,
    color: theme.colors.primary,
    marginTop: 4,
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  openLink: {
    display: 'inline-block',
    fontSize: '13px',
    fontWeight: 700,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
  cardTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  cardTagline: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.primary,
  },
  cardDesc: {
    margin: 0,
    fontSize: '13px',
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  highlights: {
    margin: '4px 0 0',
    paddingInlineStart: 18,
    fontSize: '12px',
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
}
