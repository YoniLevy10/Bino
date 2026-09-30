'use client'

/**
 * Midrag professional search — full Midrag sectors + areas/cities.
 * Deep-links to midrag.co.il in a new tab (BINO Card / Drawer / Select).
 * Opening Midrag is a search only — not a booking or hire confirmation.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, Card, Drawer, Select, theme } from '@/app/components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
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

export type MidragTicketContext = {
  ticketId?: string | null
  /** Suggested sector — only applied when confidence is high or manager already chose */
  initialSectorId?: number | null
  initialAreaName?: string | null
  initialCityId?: number | null
  suggestionNote?: string | null
}

function MidragSearchForm({ ticketContext }: { ticketContext?: MidragTicketContext | null }) {
  const allSectors = useMemo(() => midragSectorsForSelect(), [])
  const [sectorQuery, setSectorQuery] = useState('')
  // No electrician default — require explicit choice when unknown
  const [sectorId, setSectorId] = useState<number | null>(ticketContext?.initialSectorId ?? null)
  const [areaName, setAreaName] = useState(ticketContext?.initialAreaName ?? '')
  const [cityId, setCityId] = useState<number | null>(ticketContext?.initialCityId ?? null)

  useEffect(() => {
    if (ticketContext?.initialSectorId != null) setSectorId(ticketContext.initialSectorId)
    if (ticketContext?.initialAreaName != null) setAreaName(ticketContext.initialAreaName || '')
    if (ticketContext?.initialCityId != null) setCityId(ticketContext.initialCityId)
  }, [ticketContext?.initialSectorId, ticketContext?.initialAreaName, ticketContext?.initialCityId])

  async function logSearchOpened(url: string) {
    try {
      await fetchWithTimeout('/api/recommendations/midrag-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: ticketContext?.ticketId ?? null,
          sector_id: sectorId,
          city_id: cityId,
          url,
        }),
      })
    } catch {
      // non-blocking analytics
    }
  }

  const sectorOptions = useMemo(() => {
    const filtered = filterSectorsByQuery(sectorQuery, allSectors)
    const current = sectorId != null ? allSectors.find((s) => s.sectorId === sectorId) : null
    const list =
      current && !filtered.some((s) => s.sectorId === current.sectorId)
        ? [current, ...filtered]
        : filtered
    return [
      { value: '', label: 'בחרו מקצוע…' },
      ...list.map((s) => ({
        value: String(s.sectorId),
        label: s.label,
      })),
    ]
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

  const canOpenSearch = sectorId != null

  const midragUrl = buildMidragSearchUrl(searchInput)
  const midragCityUrl = buildMidragCityPickerUrl(searchInput)
  const googleBackupUrl = buildMidragGoogleBackupUrl(searchInput)
  const caption = externalSearchCaption(searchInput)
  const cityMatch = resolveMidragCity(searchInput)
  const serviceMatch = midragServiceMatchForSector(sectorId)

  return (
    <div style={styles.form}>
      <p style={styles.intro}>
        חיפוש חיצוני במידרג ({allSectors.length} תחומים) לפי אזור ועיר. התוצאות נפתחות
        בחלון חדש — זו אינה הזמנה בתוך BINO, ואין הבטחת זמינות או עמלה. אחרי שמצאתם איש
        מקצוע, אפשר להוסיף אותו לפנקס ולהעביר אליו את הקריאה.
      </p>
      {ticketContext?.suggestionNote ? (
        <span style={styles.hintWarn}>{ticketContext.suggestionNote}</span>
      ) : null}
      {ticketContext?.ticketId ? (
        <span style={styles.hint}>מחובר לקריאה — אפשר לחזור אליה אחרי החיפוש</span>
      ) : null}

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
        value={sectorId != null ? String(sectorId) : ''}
        onChange={(v) => setSectorId(v ? Number(v) : null)}
        options={sectorOptions}
        style={{ width: '100%', maxWidth: '100%' }}
      />
      {!canOpenSearch ? (
        <span style={styles.hintWarn}>נא לבחור מקצוע — אין ברירת מחדל אוטומטית</span>
      ) : serviceMatch ? (
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
          href={canOpenSearch ? midragUrl : undefined}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...styles.primaryLink,
            ...(canOpenSearch ? {} : { opacity: 0.5, pointerEvents: 'none' as const }),
          }}
          onClick={(e) => {
            if (!canOpenSearch) {
              e.preventDefault()
              return
            }
            void logSearchOpened(midragUrl)
          }}
          aria-disabled={!canOpenSearch}
        >
          פתח חיפוש במידרג
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
  ticketContext = null,
}: {
  isMobile?: boolean
  drawerOpen?: boolean
  onDrawerOpenChange?: (open: boolean) => void
  /** When opened from a ticket / recommendation — prefill profession & city when known */
  ticketContext?: MidragTicketContext | null
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const drawerOpen = drawerOpenProp ?? uncontrolledOpen
  const setDrawerOpen = onDrawerOpenChange ?? setUncontrolledOpen

  const form = <MidragSearchForm ticketContext={ticketContext} />

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
