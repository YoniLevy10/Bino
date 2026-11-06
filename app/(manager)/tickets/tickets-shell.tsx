import { theme } from '@/app/components/ui/theme'

const shellCss = `
@media (max-width: 768px) {
  .tickets-shell-wrap { display: none; }
}
`

/**
 * Static tickets heading. Action buttons portal into #tickets-header-actions
 * once the data bundle is on the page. The heading itself is not remounted.
 */
export function TicketsShell() {
  return (
    <div className="tickets-shell-wrap" style={styles.wrap}>
      <style>{shellCss}</style>
      <div style={styles.container}>
        <div style={styles.copy}>
          <div style={styles.eyebrow}>
            <span aria-hidden="true" style={styles.eyebrowDot} />
            <span>מרכז הניהול</span>
            <span aria-hidden="true">·</span>
            <span dir="ltr">BINO</span>
          </div>
          <h1 style={styles.title}>ניהול תקלות</h1>
          <p style={styles.subtitle}>חיפוש, סינון ושיוך — אותן יכולות, פריסה לפי עיצוב המסירה</p>
        </div>
        <div id="tickets-header-actions" style={styles.actions} />
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    padding: '32px 40px 0',
    maxWidth: 1400,
    margin: '0 auto',
  },
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
    marginBottom: 24,
    padding: '24px 28px',
    flexWrap: 'wrap' as const,
    border: `1px solid ${theme.colors.border}`,
    borderInlineStart: `4px solid ${theme.colors.primary}`,
    borderRadius: theme.radius.xl,
    background: `linear-gradient(110deg, ${theme.colors.surfaceActive} 0%, ${theme.colors.surface} 62%, ${theme.colors.background} 100%)`,
    boxShadow: theme.shadows.xs,
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 9,
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.03em',
    lineHeight: 1,
  },
  eyebrowDot: {
    width: 7,
    height: 7,
    flexShrink: 0,
    borderRadius: '50%',
    background: theme.colors.primary,
    boxShadow: '0 0 0 4px rgba(0, 122, 255, 0.12)',
  },
  title: {
    fontSize: 30,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    margin: 0,
    letterSpacing: '-0.035em',
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    margin: '7px 0 0',
    lineHeight: 1.55,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
    minHeight: 40,
    minWidth: 180,
  },
}
