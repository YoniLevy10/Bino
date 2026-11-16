import { theme } from '@/app/components/ui/theme'
import { DashboardAddTicketButton } from './dashboard-add-ticket-button'

export {
  requestDashboardAddTicket,
  consumeDashboardAddTicket,
  DASHBOARD_ADD_EVENT,
} from './dashboard-shell-events'

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
              <DashboardAddTicketButton />
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
    padding: '28px 40px 0',
    maxWidth: 1400,
    margin: '0 auto',
  },
  desktopToolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 14,
    minHeight: 20,
  },
  desktopDate: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    color: theme.colors.textMuted,
    letterSpacing: '0.01em',
  },
  hero: {
    marginBottom: 28,
    padding: '28px 32px',
    border: `1px solid ${theme.colors.sidebarBorder}`,
    borderRadius: theme.radius.xl,
    background: `linear-gradient(125deg, ${theme.colors.navy} 0%, ${theme.colors.navySoft} 100%)`,
    boxShadow: theme.shadows.lg,
  },
  heroTop: {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
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
  heroActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexShrink: 0,
  },
  mobileWrap: {
    padding: '12px 16px 4px',
  },
  mobileTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    letterSpacing: '-0.02em',
    lineHeight: 1.25,
  },
}