'use client'

import { Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { AddonFeaturePreview } from '@/app/components/addons/AddonFeaturePreview'
import { AddonMarketingModal } from '@/app/components/addons/AddonMarketingModal'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'
import { LEVY_TECH_BRAND } from '@/lib/addons-nav'
import {
  getPaidAddonsForDisplay,
  type PaidAddonDisplayEntry,
  type PaidAddonId,
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

const OFFICE_ADDON_IDS: PaidAddonId[] = ['calendar', 'attendance']
const PROJECT_ADDON_IDS: PaidAddonId[] = ['pilot_sms', 'project_documents']

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
              <span style={styles.lockedBadge}>בתשלום</span>
            ) : (
              <span style={styles.activeBadge}>פעיל</span>
            )}
            <span style={styles.tapHint}>לחצו לפרטים</span>
          </div>
          <h3 style={styles.cardTitle}>{entry.title}</h3>
          <p style={styles.cardTagline}>{entry.tagline}</p>
          <p style={styles.cardDesc}>{entry.description}</p>
          <ul style={styles.highlights}>
            {entry.highlights.slice(0, 2).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
      </article>
    </button>
  )
}

function AddonSection({
  title,
  subtitle,
  entries,
  hoveredId,
  onHover,
  onOpen,
}: {
  title: string
  subtitle: string
  entries: PaidAddonDisplayEntry[]
  hoveredId: PaidAddonId | null
  onHover: (id: PaidAddonId | null) => void
  onOpen: (entry: PaidAddonDisplayEntry) => void
}) {
  if (entries.length === 0) return null
  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        <p style={styles.sectionSubtitle}>{subtitle}</p>
      </div>
      <div style={styles.grid}>
        {entries.map((entry) => (
          <AddonCard
            key={entry.id}
            entry={entry}
            onOpen={onOpen}
            hovered={hoveredId === entry.id}
            onHover={onHover}
          />
        ))}
      </div>
    </section>
  )
}

function AddonsPageInner() {
  const searchParams = useSearchParams()
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [addons, setAddons] = useState<PaidAddonDisplayEntry[]>([])
  const [legacyUnlimited, setLegacyUnlimited] = useState(false)
  const [loading, setLoading] = useState(true)
  const [marketingEntry, setMarketingEntry] = useState<PaidAddonDisplayEntry | null>(null)
  const [hoveredId, setHoveredId] = useState<PaidAddonId | null>(null)

  const stats = useMemo(() => {
    const active = addons.filter((a) => !a.locked).length
    const locked = addons.length - active
    return { active, locked, total: addons.length }
  }, [addons])

  const officeAddons = useMemo(
    () => addons.filter((a) => OFFICE_ADDON_IDS.includes(a.id)),
    [addons]
  )
  const projectAddons = useMemo(
    () => addons.filter((a) => PROJECT_ADDON_IDS.includes(a.id)),
    [addons]
  )

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
        setLegacyUnlimited(enabled == null)
        setAddons(getPaidAddonsForDisplay(enabled))
      } catch {
        setAddons([])
        setLegacyUnlimited(false)
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

      <div
        style={{
          ...styles.content,
          ...(isMobile ? { padding: '16px 16px 32px', maxWidth: '100%', boxSizing: 'border-box' } : {}),
        }}
      >
        {!isMobile && <PageHeader title="תוספים" subtitle="הרחבות זמינות לחשבון" />}

        {!legacyUnlimited && !loading && addons.length > 0 && (
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
            {legacyUnlimited
              ? 'כל התוספים הבאים פעילים בחשבון שלכם — ניתן להשתמש בהם מהמערכת.'
              : 'הרחיבו את המערכת עם יכולות מתקדמות לניהול משרד ופרויקטים. לחצו על כרטיס לקריאת ההסבר המלא.'}
          </p>
          {!legacyUnlimited && (
            <p style={styles.heroContact}>
              להפעלה: <strong>הנהלת {LEVY_TECH_BRAND}</strong>
            </p>
          )}
        </div>

        {loading ? (
          <div style={styles.skeletonGrid}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={styles.skeletonCard} />
            ))}
          </div>
        ) : addons.length === 0 ? (
          <Card>
            <p style={styles.muted}>לא נמצאו תוספים להצגה.</p>
          </Card>
        ) : (
          <>
            <AddonSection
              title="ניהול משרד"
              subtitle="יומן, נוכחות ותיאום צוות במשרד האחזקה"
              entries={officeAddons}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onOpen={setMarketingEntry}
            />
            <AddonSection
              title="לכל פרויקט (בניין)"
              subtitle="כלים בתוך מסך הפרויקט — SMS פתיחה וארכיון מסמכים"
              entries={projectAddons}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onOpen={setMarketingEntry}
            />
          </>
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
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  sectionHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  sectionTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  sectionSubtitle: {
    margin: 0,
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  muted: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textMuted,
  },
  skeletonGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 20,
  },
  skeletonCard: {
    height: 320,
    borderRadius: theme.radius.lg,
    background: theme.colors.muted,
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 20,
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
