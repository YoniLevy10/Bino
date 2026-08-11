import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { buildNfcTagScanUrl } from '@/lib/nfc-tag-utils'

/** Tenant read-only: tag list (QR issued by Bamakor Super Admin). */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const { data, error } = await admin
    .from('worker_nfc_tags')
    .select(
      'id, tag_code, tag_type, project_id, label, is_active, created_at, sticker_installed_at, projects(name, project_code)'
    )
    .eq('client_id', auth.ctx.clientId)
    .order('tag_code')

  if (error) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  const tags = (data ?? []).map((row) => {
    const code = (row as { tag_code: string }).tag_code
    return { ...row, scan_url: buildNfcTagScanUrl(code) }
  })

  return NextResponse.json({ tags })
}
