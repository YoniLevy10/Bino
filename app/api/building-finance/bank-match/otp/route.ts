import { NextResponse } from 'next/server'
import { isBankMatchPocEnabled } from '@/lib/bank-match/flags'

export const dynamic = 'force-dynamic'

/** Scraping / OTP removed — file import only. */
export async function POST() {
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json(
      { error: 'מודול התאמות בנק כבוי', code: 'BANK_MATCH_DISABLED' },
      { status: 503 }
    )
  }
  return NextResponse.json(
    {
      error: 'משיכה חיה מהבנק בוטלה. אין צורך ב־OTP — ייבאו קובץ בנק.',
      code: 'SCRAPER_REMOVED',
    },
    { status: 410 }
  )
}
