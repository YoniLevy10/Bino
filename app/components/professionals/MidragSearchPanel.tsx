'use client'

/**
 * Midrag professional search — BINO design (Card / Drawer / Select / Button).
 * Deep-links to midrag.co.il in a new tab (same pattern as OpticalCenter).
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { Button, Card, Drawer, Select, theme } from '@/app/components/ui'
import {
  MIDRAG_TRADE_CATEGORIES,
  MIDRAG_TRADE_LABELS_HE,
  buildMidragCityPickerUrl,
  buildMidragGoogleBackupUrl,
  buildMidragSearchUrl,
  externalSearchCaption,
  midragCityMatchForCity,
  midragServiceMatchForCategory,
  normalizeMidragTradeCategory,
  type MidragTradeCategory,
} from '@/lib/midrag/external-search'

export const MIDRAG_SEARCH_PANEL_ID = 'midrag-search-panel'

const TRADE_OPTIONS = MIDRAG_TRADE_CATEGORIES.map((value) => ({
  value,
  label: MIDRAG_TRADE_LABELS_HE[value],
}))

function MidragSearchForm({
  category,
  city,
  onCategoryChange,
  onCityChange,
}: {
  category: MidragTradeCategory
  city: string
  onCategoryChange: (c: MidragTradeCategory) => void
  onCityChange: (c: string) => void
}) {
  const searchInput = useMemo(
    () => ({
      category,
      city: city.trim() || null,
    }),
    [category, city]
  )

  const midragUrl = buildMidragSearchUrl(searchInput)
  const midragCityUrl = buildMidragCityPickerUrl(searchInput)
  const googleBackupUrl = buildMidragGoogleBackupUrl(searchInput)
  const caption = externalSearchCaption(searchInput)
  const cityMatch = midragCityMatchForCity(searchInput.city)
  const serviceMatch = midragServiceMatchForCategory(searchInput.category)

  return (
    <div style={styles.form}>
      <p style={styles.intro}>
        בוחרים מקצוע ועיר — התוצאות נפתחות במידרג בעיר המדויקת, בחלון חדש. אחרי שמצאתם
        קבלן, הוסיפו אותו לפנקס אנשי המקצוע.
      </p>

      <label style={styles.label}>מקצוע</label>
      <Select
        value={category}
        onChange={(v) => onCategoryChange(normalizeMidragTradeCategory(v))}
        options={TRADE_OPTIONS}
        style={{ width: '100%', maxWidth: '100%' }}
      />
      {serviceMatch ? (
        <span style={styles.hint}>ממופה למידרג: {serviceMatch.midragLabel}</span>
      ) : (
        <span style={styles.hintWarn}>אין מקצוע ממופה — ייפתח בוחר תחום במידרג</span>
      )}

      <label style={styles.label}>עיר</label>
      <input
        className="app-input"
        value={city}
        onChange={(e) => onCityChange(e.target.value)}
        placeholder="למשל חיפה, אשדוד, נתניה"
        autoComplete="address-level2"
        style={styles.input}
      />
      {cityMatch ? (
        <span style={styles.hint}>ממופה למידרג: {cityMatch.midragLabel}</span>
      ) : city.trim() ? (
        <span style={styles.hintWarn}>העיר לא ממופה — ייפתח בוחר עיר במידרג</span>
      ) : null}

      <p style={styles.caption}>{caption}</p>

      <div style={styles.actions}>
        <a
          href={midragUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.primaryLink}
        >
          פתח תוצאות במידרג
          {serviceMatch ? ` · ${serviceMatch.midragLabel}` : ''}
          {cityMatch ? ` · ${cityMatch.midragLabel}` : ''}
        </a>
        <div style={styles.secondaryRow}>
          {midragCityUrl ? (
            <a
              href={midragCityUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.secondaryLink}
            >
              בחירת עיר במידרג
            </a>
          ) : null}
          <a
            href={googleBackupUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.ghostLink}
          >
            גיבוי · Google
          </a>
        </div>
      </div>
    </div>
  )
}

export function MidragSearchPanel({
  isMobile = false,
  drawerOpen: drawerOpenProp,
  onDrawerOpenChange,
}: {
  isMobile?: boolean
  /** Controlled drawer (e.g. EmptyState CTA on mobile) */
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const drawerOpen = drawerOpenProp ?? uncontrolledOpen
  const setDrawerOpen = onDrawerOpenChange ?? setUncontrolledOpen

  const [category, setCategory] = useState<MidragTradeCategory>('electrical')
  const [city, setCity] = useState('')

  const form = (
    <MidragSearchForm
      category={category}
      city={city}
      onCategoryChange={setCategory}
      onCityChange={setCity}
    />
  )

  return (
    <>
      <div id={MIDRAG_SEARCH_PANEL_ID}>
        <Card>
          <div style={styles.header}>
            <div>
              <h2 style={styles.title}>חיפוש במידרג</h2>
              <p style={styles.subtitle}>
                מצאו קבלן לפי מקצוע ועיר כשאין עדיין בפנקס
              </p>
            </div>
            {isMobile ? (
              <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
                חיפוש
              </Button>
            ) : null}
          </div>
          {isMobile ? (
            <p style={styles.mobileHint}>
              לחצו «חיפוש» לבחירת מקצוע ועיר — התוצאות נפתחות במידרג.
            </p>
          ) : (
            form
          )}
        </Card>
      </div>

      {isMobile ? (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="חיפוש איש מקצוע במידרג"
          subtitle="מקצוע ועיר לפי הבניין — נפתח בחלון חדש"
          isMobile={isMobile}
        >
          {form}
        </Drawer>
      ) : null}
    </>
  )
}

/** Scroll to Midrag panel; on mobile open the search drawer when provided. */
export function focusMidragSearch(opts?: {
  isMobile?: boolean
  openDrawer?: () => void
}) {
  if (opts?.isMobile && opts.openDrawer) {
    opts.openDrawer()
    return
  }
  const el = document.getElementById(MIDRAG_SEARCH_PANEL_ID)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  mobileHint: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  intro: {
    margin: '0 0 8px',
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 1.5,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textPrimary,
    marginTop: 8,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  hintWarn: {
    fontSize: 12,
    color: theme.colors.warning,
  },
  caption: {
    margin: '8px 0 0',
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 12,
  },
  primaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    padding: '10px 18px',
    borderRadius: 14,
    background: theme.colors.primary,
    color: theme.colors.textInverse,
    fontWeight: 600,
    fontSize: 15,
    textDecoration: 'none',
    textAlign: 'center',
  },
  secondaryRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '10px 16px',
    borderRadius: 14,
    background: theme.colors.muted,
    color: theme.colors.textPrimary,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    flex: 1,
    textAlign: 'center',
  },
  ghostLink: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '10px 16px',
    borderRadius: 14,
    color: theme.colors.textSecondary,
    fontWeight: 600,
    fontSize: 14,
    textDecoration: 'none',
    flex: 1,
    textAlign: 'center',
  },
}
