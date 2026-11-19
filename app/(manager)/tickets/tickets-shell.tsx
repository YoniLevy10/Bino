import { PageHeader } from '@/app/components/ui'

/**
 * Static tickets heading. Action buttons portal into #tickets-header-actions
 * once the data bundle is on the page. The heading itself is not remounted.
 */
export function TicketsShell() {
  return (
    <div style={styles.wrap}>
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
