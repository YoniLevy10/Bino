import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getAuditLogger } from '@/lib/logging'
import {
  CLIENT_GREENINVOICE_SELECT,
  credentialsFromClientRow,
  type ClientGreenInvoiceRow,
} from '@/lib/greeninvoice-credentials'
import { testGreenInvoiceConnection } from '@/lib/greeninvoice-client'

/**
 * Verifies Morning (Green Invoice) API credentials stored on `clients`.
 */
export async function POST() {
  const audit = getAuditLogger()
  try {
    const auth = await requireSessionMinRole('admin')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'settings-test-greeninvoice')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const { data: client, error } = await admin
      .from('clients')
      .select(CLIENT_GREENINVOICE_SELECT)
      .eq('id', clientId)
      .single()

    if (error || !client) {
      return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
    }

    const row = client as ClientGreenInvoiceRow
    const credentials = credentialsFromClientRow(row)
    if (!credentials) {
      return NextResponse.json(
        { error: 'נדרשים מפתח API וסוד — שמרו את ההגדרות לפני בדיקת חיבור' },
        { status: 400 }
      )
    }

    const result = await testGreenInvoiceConnection(credentials)
    if (!result.ok) {
      audit.logFailedOperation('READ', 'GREENINVOICE_TEST', clientId, 'single-tenant', result.error ?? 'failed')
      return NextResponse.json(
        {
          error: result.error ?? 'בדיקת חיבור נכשלה',
          errorCode: result.errorCode,
        },
        { status: 502 }
      )
    }

    audit.logAction('READ', 'GREENINVOICE_TEST', clientId, 'single-tenant', 'dashboard', undefined, 'SUCCESS')
    return NextResponse.json({
      success: true,
      businesses: result.businesses,
      currentBusiness: result.currentBusiness,
    })
  } catch (e) {
    console.error('[settings/test-greeninvoice]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
