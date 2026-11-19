/**
 * Static tickets heading (desktop). Hidden on mobile via CSS so tickets-client's
 * compact MobileHeader is the only title — no stacked "מרכז הניהול · BINO" hero.
 */
import { PageHeader } from '@/app/components/ui'

export function TicketsShell() {
  return (
    <div className="tickets-shell-desktop-only" style={styles.wrap}>
      <style>{`
        @media (max-width: 768px) {
          .tickets-shell-desktop-only { display: none !important; }
        }
      `}</style>
      <PageHeader
        title="ניהול תקלות"
        subtitle="חיפוש, סינון ושיוך — אותן יכולות, פריסה לפי עיצוב המסירה"
        actions={<div id="tickets-header-actions" style={styles.actions} />}
      />
    </div>
  )
}

const styles = {
  wrap: {
    padding: '32px 40px 0',
    maxWidth: 1400,
    margin: '0 auto' as const,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
    minHeight: 40,
  },
}
