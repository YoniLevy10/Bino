import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { buildClientResendFrom, resolveClientEmailSlug } from '@/lib/client-email-from'
import {
  buildClientLaunchChecklist,
  PLATFORM_LAUNCH_NOTES,
} from '@/lib/client-launch-checklist'
import { growLegalFromClientRow } from '@/lib/client-grow-legal'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const { id: clientId } = await context.params
  if (!clientId) {
    return NextResponse.json({ error: 'חסר מזהה לקוח' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const [clientRes, projectsRes, workersRes, adminsRes, addonsRes] = await Promise.all([
    admin
      .from('clients')
      .select(
        `
        id, name, email_slug, logo_url, manager_phone, sms_sender_name,
        whatsapp_phone_number_id, whatsapp_access_token,
        grow_enabled, grow_user_id,
        grow_legal_business_name, grow_legal_phone, grow_legal_address, grow_legal_email
      `
      )
      .eq('id', clientId)
      .maybeSingle(),
    admin.from('projects').select('id').eq('client_id', clientId),
    admin.from('workers').select('id, is_active').eq('client_id', clientId).is('deleted_at', null),
    admin.rpc('get_client_admin_emails') as unknown as Promise<{
      data: { client_id: string; email: string }[] | null
      error: unknown
    }>,
    admin
      .from('client_paid_addons')
      .select('addon_key, enabled')
      .eq('client_id', clientId)
      .eq('addon_key', PAID_ADDON_KEYS.collections)
      .maybeSingle(),
  ])

  if (clientRes.error) {
    return NextResponse.json({ error: clientRes.error.message }, { status: 500 })
  }
  if (!clientRes.data) {
    return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  }

  const c = clientRes.data as {
    id: string
    name: string
    email_slug: string | null
    logo_url: string | null
    manager_phone: string | null
    sms_sender_name: string | null
    whatsapp_phone_number_id: string | null
    whatsapp_access_token: string | null
    grow_enabled: boolean | null
    grow_user_id: string | null
    grow_legal_business_name: string | null
    grow_legal_phone: string | null
    grow_legal_address: string | null
    grow_legal_email: string | null
  }

  const adminEmail =
    (adminsRes.data ?? []).find((a) => a.client_id === clientId)?.email?.trim() || null

  const emailSlug = resolveClientEmailSlug({
    emailSlug: c.email_slug,
    clientName: c.name,
  })
  const emailFrom = buildClientResendFrom({
    clientName: c.name,
    emailSlug: c.email_slug,
  })

  const snapshot = {
    clientName: c.name,
    adminEmail,
    whatsappPhoneNumberId: c.whatsapp_phone_number_id,
    whatsappAccessTokenSet: Boolean((c.whatsapp_access_token || '').trim()),
    smsSenderName: c.sms_sender_name,
    managerPhone: c.manager_phone,
    growEnabled: c.grow_enabled === true,
    growUserId: c.grow_user_id,
    growLegalReady: growLegalFromClientRow({
      id: c.id,
      name: c.name,
      grow_legal_business_name: c.grow_legal_business_name,
      grow_legal_phone: c.grow_legal_phone,
      grow_legal_address: c.grow_legal_address,
      grow_legal_email: c.grow_legal_email,
    }).ready,
    collectionsAddonEnabled: addonsRes.data?.enabled === true,
    emailSlug,
    emailFrom,
    buildingsCount: (projectsRes.data ?? []).length,
    workersActiveCount: (workersRes.data ?? []).filter((w) => w.is_active).length,
    logoUrl: c.logo_url,
  }

  const checklist = buildClientLaunchChecklist(snapshot)

  return NextResponse.json({
    client_id: clientId,
    email_slug: c.email_slug,
    resolved_email_slug: emailSlug,
    email_from: emailFrom,
    platform_notes: PLATFORM_LAUNCH_NOTES,
    ...checklist,
    snapshot,
  })
}

export async function PATCH(req: Request, context: RouteContext) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  const { id: clientId } = await context.params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const rawSlug =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { email_slug?: unknown }).email_slug
      : undefined

  let emailSlug: string | null = null
  if (rawSlug != null) {
    const s = String(rawSlug).trim().toLowerCase()
    if (s === '') {
      emailSlug = null
    } else if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(s)) {
      return NextResponse.json(
        { error: 'slug לא תקין — רק a-z, 0-9 ומקף (למשל bamakor)' },
        { status: 400 }
      )
    } else {
      emailSlug = s
    }
  } else {
    return NextResponse.json({ error: 'חסר email_slug' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('clients')
    .update({ email_slug: emailSlug })
    .eq('id', clientId)
    .select('id, name, email_slug')
    .maybeSingle()

  if (error) {
    const msg = error.message || 'שמירה נכשלה'
    if (/unique|duplicate/i.test(msg)) {
      return NextResponse.json({ error: 'ה-slug כבר בשימוש אצל לקוח אחר' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'לקוח לא נמצא' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    email_slug: data.email_slug,
    email_from: buildClientResendFrom({
      clientName: data.name,
      emailSlug: data.email_slug,
    }),
  })
}
