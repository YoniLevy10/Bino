'use client'

import { theme } from '@/app/components/ui/theme'

const ADD_EVENT = 'bino:dashboard-add-ticket'
const PENDING_KEY = 'bino:dashboard-add-ticket-pending'

/** Ask the deferred dashboard body to open the new-ticket modal. */
export function requestDashboardAddTicket() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PENDING_KEY, '1')
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(ADD_EVENT))
}

export function consumeDashboardAddTicket(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const pending = sessionStorage.getItem(PENDING_KEY) === '1'
    if (pending) sessionStorage.removeItem(PENDING_KEY)
    return pending
  } catch {
    return false
  }
}

export const DASHBOARD_ADD_EVENT = ADD_EVENT

const shellCss = `
.dashboard-shell-mobile { display: none; }
@media (max-width: 768px) {
  .dashboard-shell-desktop { display: none; }
  .dashboard-shell-mobile { display: block; }
}
html[data-bino-dashboard] .dashboard-shell-mobile { display: none; }
`

/**
 * Desktop heading painted with the document, before the data bundle runs.
 * Stays mounted so the title is not repainted when tickets arrive.
 */
export function DashboardShell() {
  const now = new Date()
  const dateLabel = now.toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' })
  const hour = now.getHours()
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 18 ? 'צהריים טובים' : 'ערב טוב'

  return (
    <>
      <style>{shellCss}</style>
      <div className="dashboard-shell-desktop" style={styles.desktopWrap}>
        <div style={styles.desktopToolbar}>
          <p style={styles.desktopDate} suppressHydrationWarning>
            {dateLabel}
          </p>
        </div>
        <div style={styles.hero}>
          <div style={styles.heroTop}>
            <div style={styles.heroText}>
              <p style={styles.heroEyebrow}>BINO · סביבת ניהול</p>
              <h1 style={styles.heroTitle}>לוח בקרה</h1>
              <p style={styles.heroSubtitle} suppressHydrationWarning>
                {greeting} · תמונת מצב תפעולית מהנתונים החיים
              </p>
            </div>
            <div style={styles.heroActions}>
              <button type="button" onClick={requestDashboardAddTicket} style={styles.addButton}>
                + תקלה חדשה
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="dashboard-shell-mobile" style={styles.mobileWrap}>
        <h1 style={styles.mobileTitle}>לוח בקרה</h1>
      </div>
    </>
  )
}

const styles = {
  desktopWrap: {
    padding: '32px 40px 0',
    maxWidth: 1400,
    margin: '0 auto',
  },
  desktopToolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginBottom: 12,
    minHeight: 18,
  },
  desktopDate: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    color: theme.colors.textMuted,
  },
  hero: {
    marginBottom: 24,
    padding: '28px 32px',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: theme.radius.xl,
    background: `linear-gradient(125deg, ${theme.colors.navy} 0%, ${theme.colors.navySoft} 100%)`,
    boxShadow: theme.shadows.lg,
  },
  heroTop: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    flexWrap: 'wrap' as const,
  },
  heroText: { flex: 1, minWidth: 0 },
  heroEyebrow: {
    margin: '0 0 8px',
    color: theme.colors.navText,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: 700,
    color: theme.colors.textInverse,
    margin: 0,
    letterSpacing: '-0.035em',
    lineHeight: 1.2,
  },
  heroSubtitle: {
    fontSize: 14,
    color: theme.colors.navText,
    margin: '8px 0 0',
    lineHeight: 1.55,
    minHeight: 22,
  },
  heroActions: { display: 'flex', gap: 12, alignItems: 'center' },
  addButton: {
    background: theme.colors.primary,
    color: theme.colors.textInverse,
    border: 'none',
    borderRadius: theme.radius.md,
    padding: '12px 18px',
    fontWeight: 600,
    fontSize: 16,
    lineHeight: 1.2,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: theme.shadows.primaryBtn,
  },
  mobileWrap: {
    padding: '16px 16px 0',
  },
  mobileTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    letterSpacing: '-0.02em',
  },
}
