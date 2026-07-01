import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { CLIENT_SETTINGS_READ_SELECT } from '@/lib/client-settings-select'

/** Tenant settings for dashboard UI — secrets never leave the server. */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.ctx.admin
    .from('clients')
    .select(CLIENT_SETTINGS_READ_SELECT)
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  const row = data as unknown as Record<string, unknown>
  const whatsapp_access_token_set = Boolean(
    typeof row.whatsapp_access_token === 'string' && row.whatsapp_access_token.trim()
  )
  const greeninvoice_api_secret_set = Boolean(
    typeof row.greeninvoice_api_secret === 'string' && row.greeninvoice_api_secret.trim()
  )

  delete row.whatsapp_access_token
  delete row.greeninvoice_api_secret

  return NextResponse.json({
    ...row,
    whatsapp_access_token_set,
    greeninvoice_api_secret_set,
  })
}
