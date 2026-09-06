import type { UsageAnalyticsReport } from '@/lib/usage-analytics'
import { downloadExcelWorkbook } from '@/lib/excel-download'
import { exportDateSuffix } from '@/lib/export-filename'

const SIGNAL_HE: Record<string, string> = {
  core: 'ליבה',
  active: 'פעיל',
  low: 'חלש',
  unused: 'לא בשימוש',
}

export function usageAnalyticsExportFilename(lookbackDays: number, date = new Date()): string {
  return `bino-usage-${lookbackDays}d-${exportDateSuffix(date)}.xlsx`
}

/** Build + download a full usage analytics workbook (Hebrew sheet names). */
export async function downloadUsageAnalyticsExcel(report: UsageAnalyticsReport): Promise<string> {
  const XLSX = await import('xlsx')

  const metaRows = [
    {
      'הופק בתאריך': new Date(report.generated_at).toLocaleString('he-IL'),
      'חלון ימים': report.lookback_days,
      'מספר לקוחות': report.client_count,
      'page views זמין': report.page_views.available ? 'כן' : 'לא',
      'הערת page views': report.page_views.note,
    },
  ]

  const insightRows =
    report.insights.length > 0
      ? report.insights.map((text, i) => ({ מס: i + 1, תובנה: text }))
      : [{ מס: 1, תובנה: 'אין תובנות' }]

  const featureRows = report.features.map((f) => ({
    דירוג: f.rank,
    מפתח: f.key,
    'שם פיצר': f.label,
    סטטוס: SIGNAL_HE[f.signal] ?? f.signal,
    'לקוחות בחלון': f.clients_recent,
    'לקוחות הכל': f.clients_ever,
    'אירועים בחלון': f.recent_events,
    'אירועים הכל': f.total_events,
  }))

  const pageViewRows =
    report.page_views.by_nav.length > 0
      ? report.page_views.by_nav.map((r) => ({
          מפתח: r.nav_id,
          לשונית: r.label,
          צפיות: r.views,
          לקוחות: r.clients,
        }))
      : [{ מפתח: '-', לשונית: report.page_views.note, צפיות: 0, לקוחות: 0 }]

  const clientRows = report.clients.map((c) => {
    const row: Record<string, string | number> = {
      לקוח: c.name,
      מזהה: c.client_id,
      מסלול: c.plan_tier ?? '',
      'תקלה אחרונה': c.last_ticket_at
        ? new Date(c.last_ticket_at).toLocaleDateString('he-IL')
        : '',
      'פיצרים פעילים': c.active_features.join(', '),
      'תוספים בלי שימוש': c.unused_enabled_addons.join(', '),
    }
    for (const [key, val] of Object.entries(c.counts)) {
      if (key.startsWith('page:')) continue
      row[`${key}_הכל`] = val.total
      row[`${key}_חלון`] = val.recent
    }
    return row
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), 'Meta')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(insightRows), 'תובנות')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(featureRows), 'פיצרים')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pageViewRows), 'לשוניות')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientRows), 'לקוחות')

  const filename = usageAnalyticsExportFilename(report.lookback_days)
  downloadExcelWorkbook(wb, XLSX, filename)
  return filename
}
