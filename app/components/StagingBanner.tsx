'use client'

/**
 * Visible strip on staging.bino.casa so iPhone / desktop QA never confuses
 * Staging with Production (bino.casa).
 */
export function StagingBanner() {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim().toLowerCase()
  const show =
    appUrl.includes('staging.bino.casa') ||
    (process.env.NEXT_PUBLIC_BINO_STAGING_BANNER || '').trim() === '1'

  if (!show) return null

  return (
    <div
      role="status"
      className="sticky top-0 z-[100] w-full bg-amber-500 px-3 py-1.5 text-center text-sm font-semibold text-stone-950"
    >
      סביבת בדיקות (Staging) — לא ייצור. נתונים והודעות מבודדים מ־bino.casa
    </div>
  )
}
