import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSetupPackageNavFeatures } from '@/lib/client-nav-features'
import {
  loadClientCollectionsRow,
  sendCollectionCharge,
} from '@/lib/collection-charge-ops'
import { COLLECTION_CHARGE_ROW_SELECT } from '@/lib/collection-charges'
import { parseGrowEnv } from '@/lib/grow-config'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { getPublicAppUrl, getWorkerPortalUrl } from '@/lib/public-app-url'
import {
  SANDBOX_ADMIN_EMAIL,
  SANDBOX_CLIENT_NAME,
  SANDBOX_PROJECT_CODE,
  SANDBOX_PROJECT_NAME,
  SANDBOX_RESIDENT_NAME,
  SANDBOX_WORKER_NAME,
  type SandboxActionResult,
  type SandboxStatus,
} from '@/lib/sandbox-lab'
import { sendManagerSMS } from '@/lib/sms-send'
import { sendWhatsAppTextMessageWithCredentials } from '@/lib/whatsapp-send'
import { normalizeTier } from '@/lib/plan-limits'

function appBase(): string {
  return getPublicAppUrl() || 'https://bino.casa'
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('972') && digits.length >= 11) return digits
  if (digits.startsWith('0') && digits.length >= 9) return `972${digits.slice(1)}`
  if (digits.length >= 9) return `972${digits}`
  return null
}

async function findBamakorId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from('clients')
    .select('id')
    .eq('name', 'Bamakor')
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function loadSandboxStatus(admin: SupabaseClient): Promise<SandboxStatus> {
  const base: SandboxStatus = {
    client_id: null,
    client_name: SANDBOX_CLIENT_NAME,
    admin_email: SANDBOX_ADMIN_EMAIL,
    exists: false,
    project_id: null,
    project_code: null,
    worker_id: null,
    worker_portal_url: null,
    resident_id: null,
    manager_phone: null,
    sms_sender_name: null,
    whatsapp_phone_number_id: null,
    whatsapp_access_token_set: false,
    grow_enabled: false,
    grow_user_id: null,
    collections_enabled: false,
    email_slug: null,
    report_url: null,
    vaad_pay_url: null,
    dashboard_hint: 'לחצו «הכן Sandbox» כדי ליצור לקוח בדיקה אמיתי במערכת',
    grow_env: parseGrowEnv(process.env.GROW_ENV),
  }

  const { data: client } = await admin
    .from('clients')
    .select(
      `
      id, name, manager_phone, sms_sender_name, email_slug,
      whatsapp_phone_number_id, whatsapp_access_token,
      grow_enabled, grow_user_id
    `
    )
    .eq('name', SANDBOX_CLIENT_NAME)
    .maybeSingle()

  if (!client) return base

  const clientId = (client as { id: string }).id
  const [projectRes, workerRes, residentRes, addonRes] = await Promise.all([
    admin
      .from('projects')
      .select('id, project_code')
      .eq('client_id', clientId)
      .eq('project_code', SANDBOX_PROJECT_CODE)
      .maybeSingle(),
    admin
      .from('workers')
      .select('id, access_token')
      .eq('client_id', clientId)
      .eq('full_name', SANDBOX_WORKER_NAME)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('residents')
      .select('id')
      .eq('client_id', clientId)
      .eq('full_name', SANDBOX_RESIDENT_NAME)
      .is('deleted_at', null)
      .maybeSingle(),
    admin
      .from('client_paid_addons')
      .select('enabled')
      .eq('client_id', clientId)
      .eq('addon_key', PAID_ADDON_KEYS.collections)
      .maybeSingle(),
  ])

  const project = projectRes.data as { id: string; project_code: string } | null
  const worker = workerRes.data as { id: string; access_token: string | null } | null
  const c = client as {
    manager_phone: string | null
    sms_sender_name: string | null
    email_slug: string | null
    whatsapp_phone_number_id: string | null
    whatsapp_access_token: string | null
    grow_enabled: boolean | null
    grow_user_id: string | null
  }

  return {
    ...base,
    client_id: clientId,
    exists: true,
    project_id: project?.id ?? null,
    project_code: project?.project_code ?? null,
    worker_id: worker?.id ?? null,
    worker_portal_url: worker?.access_token
      ? getWorkerPortalUrl(worker.access_token)
      : null,
    resident_id: (residentRes.data as { id: string } | null)?.id ?? null,
    manager_phone: c.manager_phone,
    sms_sender_name: c.sms_sender_name,
    whatsapp_phone_number_id: c.whatsapp_phone_number_id,
    whatsapp_access_token_set: Boolean((c.whatsapp_access_token || '').trim()),
    grow_enabled: c.grow_enabled === true,
    grow_user_id: c.grow_user_id,
    collections_enabled: addonRes.data?.enabled === true,
    email_slug: c.email_slug,
    report_url: project
      ? `${appBase()}/report?project=${encodeURIComponent(project.project_code)}&client=${encodeURIComponent(clientId)}`
      : null,
    vaad_pay_url: `${appBase()}/vaad-pay/${clientId}`,
    dashboard_hint: 'השתמשו בכפתורים למטה — כל אחד מריץ פעולה אמיתית במערכת',
  }
}

async function ensureOrgAndAdmin(
  admin: SupabaseClient,
  clientId: string,
  companyName: string
): Promise<{ orgId: string; userId: string }> {
  const { data: existingOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle()

  let orgId = (existingOrg as { id: string } | null)?.id
  if (!orgId) {
    const slug = `bino-sandbox-${clientId.slice(0, 8)}`
    const { data: orgRow, error: orgErr } = await admin
      .from('organizations')
      .insert({
        name: companyName,
        slug,
        client_id: clientId,
        is_active: true,
      })
      .select('id')
      .single()
    if (orgErr || !orgRow) throw new Error(orgErr?.message || 'יצירת ארגון נכשלה')
    orgId = (orgRow as { id: string }).id
  }

  const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  let userId = listed?.users?.find(
    (u) => (u.email || '').toLowerCase() === SANDBOX_ADMIN_EMAIL.toLowerCase()
  )?.id

  if (!userId) {
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      SANDBOX_ADMIN_EMAIL,
      {
        data: { client_id: clientId, organization_id: orgId },
        redirectTo: `${appBase()}/auth/callback`,
      }
    )
    if (inviteErr || !invited?.user) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: SANDBOX_ADMIN_EMAIL,
        email_confirm: true,
        user_metadata: { client_id: clientId, organization_id: orgId },
      })
      if (createErr || !created.user) {
        throw new Error(inviteErr?.message || createErr?.message || 'יצירת משתמש Sandbox נכשלה')
      }
      userId = created.user.id
    } else {
      userId = invited.user.id
    }
  }

  const { data: link } = await admin
    .from('organization_users')
    .select('id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!link) {
    const { error: ouErr } = await admin.from('organization_users').insert({
      organization_id: orgId,
      user_id: userId,
      role: 'admin',
    })
    if (ouErr) throw new Error(ouErr.message)
  }

  return { orgId, userId }
}

export async function ensureSandbox(admin: SupabaseClient): Promise<SandboxActionResult> {
  let status = await loadSandboxStatus(admin)
  let clientId = status.client_id

  if (!clientId) {
    const { data: clientRow, error: clientErr } = await admin
      .from('clients')
      .insert({
        name: SANDBOX_CLIENT_NAME,
        plan_tier: normalizeTier('pro'),
        manager_phone: null,
        email_slug: 'sandbox',
        enabled_nav_features: getSetupPackageNavFeatures(),
        grow_enabled: false,
      })
      .select('id')
      .single()
    if (clientErr || !clientRow) {
      return { ok: false, error: clientErr?.message || 'יצירת לקוח Sandbox נכשלה' }
    }
    clientId = (clientRow as { id: string }).id
  }

  const { orgId } = await ensureOrgAndAdmin(admin, clientId, SANDBOX_CLIENT_NAME)

  // Project
  let projectId = status.project_id
  if (!projectId) {
    const { data: project, error: pErr } = await admin
      .from('projects')
      .insert({
        client_id: clientId,
        organization_id: orgId,
        name: SANDBOX_PROJECT_NAME,
        project_code: SANDBOX_PROJECT_CODE,
        address: 'כתובת בדיקה — Sandbox',
        qr_identifier: `START_${SANDBOX_PROJECT_CODE}`,
        is_active: true,
      })
      .select('id')
      .single()
    if (pErr || !project) {
      // maybe exists under different query
      const { data: existing } = await admin
        .from('projects')
        .select('id')
        .eq('client_id', clientId)
        .eq('project_code', SANDBOX_PROJECT_CODE)
        .maybeSingle()
      projectId = (existing as { id: string } | null)?.id ?? null
      if (!projectId) return { ok: false, error: pErr?.message || 'יצירת בניין נכשלה' }
    } else {
      projectId = (project as { id: string }).id
    }
  }

  // Worker
  if (!status.worker_id) {
    const { error: wErr } = await admin.from('workers').insert({
      client_id: clientId,
      organization_id: orgId,
      full_name: SANDBOX_WORKER_NAME,
      phone: '972500000001',
      email: null,
      role: 'maintenance',
      is_active: true,
      access_token: randomUUID(),
    })
    if (wErr && !/unique|duplicate/i.test(wErr.message)) {
      return { ok: false, error: wErr.message }
    }
  }

  // Resident
  if (!status.resident_id && projectId) {
    const { error: rErr } = await admin.from('residents').insert({
      client_id: clientId,
      project_id: projectId,
      full_name: SANDBOX_RESIDENT_NAME,
      phone: '0500000002',
      normalized_phone: '972500000002',
      apartment_number: '1',
      email: 'sandbox-resident@bino.casa',
    })
    if (rErr && !/unique|duplicate/i.test(rErr.message)) {
      return { ok: false, error: rErr.message }
    }
  }

  // Collections addon + nav
  const now = new Date().toISOString()
  await admin.from('client_paid_addons').upsert(
    {
      client_id: clientId,
      addon_key: PAID_ADDON_KEYS.collections,
      enabled: true,
      enabled_at: now,
      notes: 'sandbox lab',
      updated_at: now,
    },
    { onConflict: 'client_id,addon_key' }
  )

  // Unlock collections (+ core) in nav if column is array
  const { data: navRow } = await admin
    .from('clients')
    .select('enabled_nav_features')
    .eq('id', clientId)
    .maybeSingle()
  const nav = (navRow as { enabled_nav_features?: string[] | null } | null)?.enabled_nav_features
  if (Array.isArray(nav) && !nav.includes('collections')) {
    await admin
      .from('clients')
      .update({ enabled_nav_features: [...nav, 'collections', 'tickets', 'workers', 'projects', 'settings'] })
      .eq('id', clientId)
  }

  status = await loadSandboxStatus(admin)
  return {
    ok: true,
    message: 'Sandbox מוכן — אפשר להריץ פעולות חיות',
    status,
  }
}

export async function sandboxSaveChannels(
  admin: SupabaseClient,
  input: {
    sms_sender_name?: string | null
    whatsapp_phone_number_id?: string | null
    whatsapp_access_token?: string | null
    manager_phone?: string | null
  }
): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok || !ensured.status?.client_id) return ensured
  const clientId = ensured.status.client_id

  const patch: Record<string, unknown> = {}
  if (input.sms_sender_name !== undefined) {
    const v = (input.sms_sender_name || '').trim()
    patch.sms_sender_name = v || null
  }
  if (input.whatsapp_phone_number_id !== undefined) {
    patch.whatsapp_phone_number_id = (input.whatsapp_phone_number_id || '').trim() || null
  }
  if (input.whatsapp_access_token !== undefined) {
    const tok = (input.whatsapp_access_token || '').trim()
    if (tok) patch.whatsapp_access_token = tok
  }
  if (input.manager_phone !== undefined) {
    const phone = input.manager_phone ? normalizePhone(input.manager_phone) : null
    patch.manager_phone = phone
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'אין מה לשמור' }
  }

  const { error } = await admin.from('clients').update(patch).eq('id', clientId)
  if (error) return { ok: false, error: error.message }

  const status = await loadSandboxStatus(admin)
  return { ok: true, message: 'ערוצים נשמרו ב-Sandbox', status }
}

export async function sandboxCopyGrowFromBamakor(
  admin: SupabaseClient
): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok || !ensured.status?.client_id) return ensured
  const sandboxId = ensured.status.client_id
  const bamakorId = await findBamakorId(admin)
  if (!bamakorId) return { ok: false, error: 'Bamakor לא נמצא' }

  const { data: src, error } = await admin
    .from('clients')
    .select(
      `
      grow_user_id,
      grow_legal_business_name, grow_legal_phone, grow_legal_address, grow_legal_email
    `
    )
    .eq('id', bamakorId)
    .maybeSingle()
  if (error || !src) return { ok: false, error: error?.message || 'טעינת Bamakor נכשלה' }

  // grow_user_id is UNIQUE — cannot clone Bamakor's id. Copy legal fields only;
  // pay-link action falls back to Bamakor for live ₪1 tests.
  const { error: upErr } = await admin
    .from('clients')
    .update({
      grow_legal_business_name: 'BINO Sandbox',
      grow_legal_phone:
        (src as { grow_legal_phone?: string | null }).grow_legal_phone ||
        ensured.status.manager_phone,
      grow_legal_address: 'Sandbox lab — BINO',
      grow_legal_email: SANDBOX_ADMIN_EMAIL,
    })
    .eq('id', sandboxId)
  if (upErr) return { ok: false, error: upErr.message }

  const status = await loadSandboxStatus(admin)
  const hasBamakorGrow = Boolean((src as { grow_user_id?: string | null }).grow_user_id)
  return {
    ok: true,
    message: hasBamakorGrow
      ? 'פרטי עסק ל-/vaad-pay עודכנו. חיוב ₪1 ירוץ על Bamakor (userId ייחודי — אי אפשר להעתיק).'
      : 'פרטי עסק עודכנו. ל-Bamakor אין Grow — הגדירו GetLink לפני בדיקת תשלום.',
    status,
  }
}

export async function sandboxMagicLink(admin: SupabaseClient): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok) return ensured

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: SANDBOX_ADMIN_EMAIL,
    options: { redirectTo: `${appBase()}/auth/callback` },
  })
  if (error) return { ok: false, error: error.message }
  const link = (data as { properties?: { action_link?: string } })?.properties?.action_link
  if (!link) return { ok: false, error: 'לא נוצר קישור כניסה' }
  return {
    ok: true,
    message: `כניסה כמנהל Sandbox (${SANDBOX_ADMIN_EMAIL})`,
    url: link,
    status: await loadSandboxStatus(admin),
  }
}

export async function sandboxCreateTicket(admin: SupabaseClient): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok || !ensured.status?.client_id || !ensured.status.project_id) {
    return { ok: false, error: ensured.error || 'Sandbox לא מוכן' }
  }
  const { client_id: clientId, project_id: projectId } = ensured.status
  const description = `תקלת Sandbox — ${new Date().toLocaleString('he-IL')}`

  const { data: ticket, error } = await admin
    .from('tickets')
    .insert({
      client_id: clientId,
      project_id: projectId,
      description,
      status: 'NEW',
      source: 'manual',
      reporter_phone: ensured.status.manager_phone || '972500000002',
    })
    .select('id, ticket_number')
    .single()

  if (error || !ticket) return { ok: false, error: error?.message || 'יצירת תקלה נכשלה' }

  const t = ticket as unknown as { id: string; ticket_number?: number | null }
  return {
    ok: true,
    message: `נוצרה תקלה${t.ticket_number != null ? ` #${t.ticket_number}` : ''} — פתחו את הדשבורד לראות אותה`,
    ticket_id: t.id,
    ticket_number: t.ticket_number ?? null,
    url: `${appBase()}/tickets`,
    status: await loadSandboxStatus(admin),
  }
}

export async function sandboxSendSms(
  admin: SupabaseClient,
  toOverride?: string | null
): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok || !ensured.status?.client_id) return ensured
  const st = ensured.status
  const to = normalizePhone(toOverride || st.manager_phone || '')
  if (!to) return { ok: false, error: 'הזינו טלפון בדיקה (05… / 972…)' }
  if (!hasPhoneSender(st.sms_sender_name)) {
    return {
      ok: false,
      error: 'חסר מספר שולח 019 (972…) — הדביקו בשדות הערוצים למעלה ושמרו',
    }
  }

  // Persist test phone as manager for later actions
  await admin.from('clients').update({ manager_phone: to }).eq('id', st.client_id)

  const ok = await sendManagerSMS(
    to,
    'הודעת בדיקה מ-BINO Sandbox - SMS עובד',
    st.sms_sender_name,
    st.client_id
  )
  if (!ok) {
    return {
      ok: false,
      error: 'שליחת SMS נכשלה — בדקו 019 / מספר שולח (חייבים 972… לא שם מותג)',
    }
  }
  return {
    ok: true,
    message: `SMS נשלח אל ${to}`,
    status: await loadSandboxStatus(admin),
  }
}

function hasPhoneSender(raw: string | null | undefined): boolean {
  const v = (raw || '').replace(/\D/g, '')
  return v.length >= 10
}

export async function sandboxSendWhatsApp(
  admin: SupabaseClient,
  toOverride?: string | null
): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok || !ensured.status?.client_id) return ensured
  const st = ensured.status
  if (!st.whatsapp_phone_number_id || !st.whatsapp_access_token_set) {
    return {
      ok: false,
      error: 'חסרים WA Phone Number ID / Access Token — הדביקו בשדות הערוצים ושמרו',
    }
  }
  const to = normalizePhone(toOverride || st.manager_phone || '')
  if (!to) return { ok: false, error: 'הזינו טלפון בדיקה' }

  const { data: client } = await admin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', st.client_id)
    .single()
  const phoneNumberId = (client as { whatsapp_phone_number_id?: string | null } | null)
    ?.whatsapp_phone_number_id
  const accessToken = (client as { whatsapp_access_token?: string | null } | null)
    ?.whatsapp_access_token
  if (!phoneNumberId || !accessToken) {
    return { ok: false, error: 'טוקן WhatsApp חסר ב-DB' }
  }

  await admin.from('clients').update({ manager_phone: to }).eq('id', st.client_id)

  const sent = await sendWhatsAppTextMessageWithCredentials(
    phoneNumberId,
    accessToken,
    to,
    'בדיקת חיבור מ-BINO Sandbox — WhatsApp עובד'
  )
  if (!sent) return { ok: false, error: 'שליחת WhatsApp נכשלה — בדקו Meta token / מספר' }
  return {
    ok: true,
    message: `WhatsApp נשלח אל ${to}`,
    status: await loadSandboxStatus(admin),
  }
}

export async function sandboxCreatePayLink(admin: SupabaseClient): Promise<SandboxActionResult> {
  const ensured = await ensureSandbox(admin)
  if (!ensured.ok || !ensured.status) return ensured
  const st = ensured.status

  // Prefer sandbox Grow if uniquely configured; otherwise Bamakor (unique grow_user_id).
  let payClientId = st.client_id
  let usingBamakor = false
  if (!st.grow_user_id || !st.grow_enabled) {
    const bamakorId = await findBamakorId(admin)
    if (!bamakorId) {
      return {
        ok: false,
        error: 'אין Grow ב-Sandbox ואין Bamakor — הגדירו GetLink קודם',
      }
    }
    payClientId = bamakorId
    usingBamakor = true
  }
  if (!payClientId) return { ok: false, error: 'חסר לקוח לתשלום' }

  const { data: project } = await admin
    .from('projects')
    .select('id, name')
    .eq('client_id', payClientId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!project) return { ok: false, error: 'לא נמצא בניין ללקוח התשלום' }

  let { data: resident } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone, apartment_number, email, project_id')
    .eq('client_id', payClientId)
    .eq('project_id', (project as { id: string }).id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const phoneNorm = st.manager_phone || '972500000002'
  const phoneLocal = phoneNorm.replace(/^972/, '0')

  if (!resident) {
    const { data: created, error: rErr } = await admin
      .from('residents')
      .insert({
        client_id: payClientId,
        project_id: (project as { id: string }).id,
        full_name: SANDBOX_RESIDENT_NAME,
        phone: phoneLocal,
        normalized_phone: phoneNorm,
        apartment_number: '1',
        email: 'sandbox-resident@bino.casa',
      })
      .select('id, full_name, phone, normalized_phone, apartment_number, email, project_id')
      .single()
    if (rErr || !created) return { ok: false, error: rErr?.message || 'יצירת דייר לתשלום נכשלה' }
    resident = created
  } else if (st.manager_phone) {
    await admin
      .from('residents')
      .update({ phone: phoneLocal, normalized_phone: phoneNorm })
      .eq('id', (resident as { id: string }).id)
    resident = {
      ...(resident as object),
      phone: phoneLocal,
      normalized_phone: phoneNorm,
    } as typeof resident
  }

  const clientRow = await loadClientCollectionsRow(admin, payClientId)
  if (!clientRow) return { ok: false, error: 'לקוח תשלום לא נמצא' }

  // Ensure collections addon on pay client
  const now = new Date().toISOString()
  await admin.from('client_paid_addons').upsert(
    {
      client_id: payClientId,
      addon_key: PAID_ADDON_KEYS.collections,
      enabled: true,
      enabled_at: now,
      notes: 'sandbox lab pay',
      updated_at: now,
    },
    { onConflict: 'client_id,addon_key' }
  )

  const { data: inserted, error: insertErr } = await admin
    .from('collection_charges')
    .insert({
      client_id: payClientId,
      project_id: (project as { id: string }).id,
      resident_id: (resident as { id: string }).id,
      title: 'חיוב Sandbox ₪1',
      description: 'בדיקת תשלום מקצה לקצה ממעבדת Sandbox',
      amount: 1,
      currency: 'ILS',
      status: 'draft',
      period_label: 'sandbox',
      public_token: randomUUID(),
      created_by: 'sandbox-lab',
    })
    .select(COLLECTION_CHARGE_ROW_SELECT)
    .single()

  if (insertErr || !inserted) {
    return { ok: false, error: insertErr?.message || 'יצירת חיוב נכשלה' }
  }

  const payClientSms = usingBamakor
    ? ((clientRow as { sms_sender_name?: string | null }).sms_sender_name || null)
    : st.sms_sender_name

  const sent = await sendCollectionCharge(admin, {
    clientId: payClientId,
    charge: inserted as never,
    resident: resident as never,
    project: project as never,
    clientRow,
    sendSms: Boolean(st.manager_phone && hasPhoneSender(payClientSms)),
  })

  if (!sent.ok) {
    return { ok: false, error: sent.error || 'שליחת חיוב ל-Grow נכשלה' }
  }

  return {
    ok: true,
    message: usingBamakor
      ? 'נוצר חיוב ₪1 על Bamakor (Grow פעיל) — פתחו את הקישור ושלמו'
      : 'נוצר חיוב ₪1 על Sandbox — פתחו את הקישור ושלמו',
    url: sent.payUrl,
    charge_id: (inserted as unknown as { id: string }).id,
    status: await loadSandboxStatus(admin),
  }
}
