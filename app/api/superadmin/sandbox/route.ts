import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import type { SandboxAction } from '@/lib/sandbox-lab'
import {
  ensureSandbox,
  loadSandboxStatus,
  sandboxCopyGrowFromBamakor,
  sandboxCreatePayLink,
  sandboxCreateTicket,
  sandboxMagicLink,
  sandboxSaveChannels,
  sandboxSendSms,
  sandboxSendWhatsApp,
} from '@/lib/sandbox-lab-service'

export async function GET(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()
  const admin = getSupabaseAdmin()
  const status = await loadSandboxStatus(admin)
  return NextResponse.json({ status })
}

export async function POST(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const action = (
    body && typeof body === 'object' && !Array.isArray(body)
      ? String((body as { action?: unknown }).action || '')
      : ''
  ) as SandboxAction

  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >

  const admin = getSupabaseAdmin()

  let result
  switch (action) {
    case 'ensure':
      result = await ensureSandbox(admin)
      break
    case 'save_channels':
      result = await sandboxSaveChannels(admin, {
        sms_sender_name: b.sms_sender_name != null ? String(b.sms_sender_name) : undefined,
        whatsapp_phone_number_id:
          b.whatsapp_phone_number_id != null ? String(b.whatsapp_phone_number_id) : undefined,
        whatsapp_access_token:
          b.whatsapp_access_token != null ? String(b.whatsapp_access_token) : undefined,
        manager_phone: b.manager_phone != null ? String(b.manager_phone) : undefined,
      })
      break
    case 'copy_grow_from_bamakor':
      result = await sandboxCopyGrowFromBamakor(admin)
      break
    case 'magic_link':
      result = await sandboxMagicLink(admin)
      break
    case 'create_ticket':
      result = await sandboxCreateTicket(admin)
      break
    case 'send_sms':
      result = await sandboxSendSms(admin, b.to != null ? String(b.to) : null)
      break
    case 'send_whatsapp':
      result = await sandboxSendWhatsApp(admin, b.to != null ? String(b.to) : null)
      break
    case 'create_pay_link':
      result = await sandboxCreatePayLink(admin)
      break
    case 'set_test_phone':
      result = await sandboxSaveChannels(admin, {
        manager_phone: b.to != null ? String(b.to) : null,
      })
      break
    default:
      return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
}
