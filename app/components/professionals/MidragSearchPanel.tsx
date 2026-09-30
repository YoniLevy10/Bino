'use client'

/**
 * Midrag professional search — full Midrag sectors + areas/cities.
 * Deep-links to midrag.co.il in a new tab (BINO Card / Drawer / Select).
 */
import { useMemo, useState, type CSSProperties } from 'react'
import { Button, Card, Drawer, Select, theme } from '@/app/components/ui'
import {
  filterSectorsByQuery,
  midragAreaNames,
  midragCitiesForArea,
  midragSectorsForSelect,
} from '@/lib/midrag/catalog'
import {
  buildMidragCityPickerUrl,
  buildMidragGoogleBackupUrl,
  buildMidragSearchUrl,
  externalSearchCaption,
  midragServiceMatchForSector,
  resolveMidragCity,
  type ExternalSearchInput,
} from '@/lib/midrag/external-search'

export const MIDRAG_SEARCH_PANEL_ID = 'midrag-search-panel'

const DEFAULT_SECTOR_ID = 5 // חשמלאים

function MidragSearchForm() {
  const allSectors = useMemo(() => midragSectorsForSelect(), [])
  const [sectorQuery, setSectorQuery] = useState('')
  const [sectorId, setSectorId] = useState<number>(DEFAULT_SECTOR_ID)
  const [areaName, setAreaName] = useState('')
  const [cityId, setCityId] = useState<number | null>(null)

  const sectorOptions = useMemo(() => {
    const filtered = filterSectorsByQuery(sectorQuery, allSectors)
    // Keep current selection visible even if filtered out
    const current = allSectors.find((s) => s.sectorId === sectorId)
    const list =
      current && !filtered.some((s) => s.sectorId === current.sectorId)
        ? [current, ...filtered]
        : filtered
    return list.map((s) => ({
      value: String(s.sectorId),
      label: s.label,
    }))
  }, [allSectors, sectorQuery, sectorId])

  const areaOptions = useMemo(
    () => [
      { value: '', label: 'כל האזורים / ללא אזור' },
      ...midragAreaNames().map((a) => ({ value: a, label: a })),
    ],
    []
  )

  const cityOptions = useMemo(() => {
    const cities = midragCitiesForArea(areaName || null)
    return [
      {
        value: '',
        label: areaName ? 'עיר מרכזית באזור (ברירת מחדל)' : 'בחרו אזור תחילה',
      },
      ...cities.map((c) => ({ value: String(c.cityId), label: c.label })),
    ]
  }, [areaName])

  const searchInput: ExternalSearchInput = useMemo(
    () => ({
      sectorId,
      areaName: areaName || null,
      cityId,
    }),
    [sectorId, areaName, cityId]
  )

  const midragUrl = buildMidragSearchUrl(searchInput)
  const midragCityUrl = buildMidragCityPickerUrl(searchInput)
  const googleBackupUrl = buildMidragGoogleBackupUrl(searchInput)
  const caption = externalSearchCaption(searchInput)
  const cityMatch = resolveMidragCity(searchInput)
  const serviceMatch = midragServiceMatchForSector(sectorId)

  return (
    <div style={styles.form}>
      <p style={styles.intro}>
        כל תחומי מידרג ({allSectors.length}) לפי אזור ועיר — התוצאות נפתחות במידרג בחלון
        חדש. אחרי שמצאתם קבלן, הוסיפו אותו לפנקס אנשי המקצוע.
      </p>

      <label style={styles.label}>סינון מקצוע</label>
      <input
        className="app-input"
        value={sectorQuery}
        onChange={(e) => setSectorQuery(e.target.value)}
        placeholder="הקלידו לסינון — חשמל, איטום, מעליות…"
        style={styles.input}
      />

      <label style={styles.label}>מקצוע / תחום במידרג</label>
      <Select
        value={String(sectorId)}
        onChange={(v) => setSectorId(Number(v) || DEFAULT_SECTOR_ID)}
        options={sectorOptions}
        style={{ width: '100%', maxWidth: '100%' }}
      />
      {serviceMatch ? (
        <span style={styles.hint}>ייפתח במידרג: {serviceMatch.midragLabel}</span>
      ) : (
        <span style={styles.hintWarn}>אין מיפוי שירות — ייפתח דף התחום במידרג</span>
      )}

      <label style={styles.label}>אזור</label>
      <Select
        value={areaName}
        onChange={(v) => {
          setAreaName(v)
          setCityId(null)
        }}
        options={areaOptions}
        style={{ width: '100%', maxWidth: '100%' }}
      />

      <label style={styles.label}>עיר</label>
      <Select
        value={cityId != null ? String(cityId) : ''}
        onChange={(v) => setCityId(v ? Number(v) : null)}
        options={cityOptions}
        style={{ width: '100%', maxWidth: '100%' }}
      />
      {cityMatch ? (
        <span style={styles.hint}>
          ממופה למידרג: {cityMatch.label}
          {cityMatch.areaName ? ` · ${cityMatch.areaName}` : ''}
        </span>
      ) : areaName ? (
        <span style={styles.hintWarn}>בחרו עיר, או השאירו ריק לעיר המרכזית באזור</span>
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
          {cityMatch ? ` · ${cityMatch.label}` : ''}
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
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const drawerOpen = drawerOpenProp ?? uncontrolledOpen
  const setDrawerOpen = onDrawerOpenChange ?? setUncontrolledOpen

  const form = <MidragSearchForm />

  return (
    <>
      <div id={MIDRAG_SEARCH_PANEL_ID}>
        <Card>
          <div style={styles.header}>
            <div>
              <h2 style={styles.title}>חיפוש במידרג</h2>
              <p style={styles.subtitle}>
                כל התחומים במידרג — לפי אזור ועיר בישראל
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
              לחצו «חיפוש» לבחירת מקצוע, אזור ועיר — התוצאות נפתחות במידרג.
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
          subtitle="מקצוע · אזור · עיר — נפתח בחלון חדש"
          isMobile={isMobile}
        >
          {form}
        </Drawer>
      ) : null}
    </>
  )
}

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
