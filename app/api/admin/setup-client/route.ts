/**
 * POST /api/admin/setup-client — הקמת לקוח חדש בפעולה אטומית
 *
 * @description
 * API פנימי (מוגן ב-Supabase Auth + MFA AAL2).
 * מקים בבת-אחת: clients → organizations → auth.invite → organization_users → projects → workers.
 * מחזיר: client_id, org_id, admin_user_id, קישורי QR לכל פרויקט.
 *
 * @security מחייב סשן סופר־אדמין מורשה + MFA (AAL2)
 * @method POST
 * @body {SetupSchema} body — ראה setupSchema למטה
 */
import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin/superadmin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { z } from 'zod'
import { getSetupPackageNavFeatures } from '@/lib/client/client-nav-features'
import { normalizeTier } from '@/lib/plans/plan-limits'
import { parseWorkerPhone } from '@/lib/worker/worker-phones'
import { getPublicAppUrl } from '@/lib/shared/public-app-url'
import { BINO_PUBLIC_ORIGIN } from '@/lib/shared/public-origin'
import { normalizePhone019 } from '@/lib/sms/sms-019-core'

// ─── Schema ───────────────────────────────────────────────────────────────────
const setupSchema = z.object({
  /** שם החברה / הלקוח */
  company_name: z.string().min(1).max(200),
  plan_tier: z.enum(['starter', 'pro', 'business', 'enterprise']).default('starter'),
  /** אימייל מנהל הלקוח — ישלח הזמנה ל-Supabase Auth */
  admin_email: z.string().email(),
  /** אופציונלי — יצירת משתמש עם סיסמה במקום הזמנה במייל */
  admin_password: z.string().min(8).max(100).optional(),
  /** טלפון מנהל (לצורך WhatsApp כ-fallback) */
  admin_phone: z.string().max(40).optional(),
  /** מזהה מספר WhatsApp Business ב-Meta (Phone Number ID) */
  whatsapp_phone_number_id: z.string().max(100).optional(),
  /** הספרות שדיירים שולחים הודעה אליהן (לbuild QR link) */
  whatsapp_business_phone: z.string().max(40).optional(),
  /** שולח 019SMS — 972… בלבד */
  sms_sender_name: z.string().max(40).optional(),
  projects: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        project_code: z.string().min(1).max(40),
        address: z.string().max(500).optional(),
      })
    )
    .max(100)
    .optional()
    .default([]),
  workers: z
    .array(
      z.object({
        full_name: z.string().min(1).max(200),
        phone: z.string().min(6).max(40),
        email: z.string().email().optional(),
        role: z.string().max(100).optional(),
      })
    )
    .optional()
    .default([]),
})

// ─── Auth guard ───────────────────────────────────────────────────────────────

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = setupSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data
  const supabase = getSupabaseAdmin()
  const appUrl = getPublicAppUrl() || BINO_PUBLIC_ORIGIN

  try {
    let smsSender: string | null = null
    if (d.sms_sender_name?.trim()) {
      smsSender = normalizePhone019(d.sms_sender_name)
      if (!smsSender) {
        return NextResponse.json(
          { error: 'sms_sender_name must be an Israeli mobile (05… / 9725…)' },
          { status: 400 }
        )
      }
    }

    // ── 1. Create client row ──────────────────────────────────────────────────
    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .insert({
        name: d.company_name,
        plan_tier: normalizeTier(d.plan_tier),
        whatsapp_phone_number_id: d.whatsapp_phone_number_id ?? null,
        whatsapp_business_phone: d.whatsapp_business_phone ?? null,
        manager_phone: d.admin_phone ?? null,
        sms_sender_name: smsSender,
        /** New tenants: core tabs only; premium unlocked via superadmin after payment. */
        enabled_nav_features: getSetupPackageNavFeatures(),
      })
      .select('id')
      .single()

    if (clientErr || !clientRow) {
      return NextResponse.json({ error: `Client creation failed: ${clientErr?.message}` }, { status: 500 })
    }
    const clientId = (clientRow as { id: string }).id

    // ── 2. Create organization ────────────────────────────────────────────────
    const slug = d.company_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80)

    const { data: orgRow, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: d.company_name,
        slug: `${slug}-${clientId.slice(0, 8)}`,
        client_id: clientId,
        is_active: true,
      })
      .select('id')
      .single()

    if (orgErr || !orgRow) {
      return NextResponse.json({ error: `Organization creation failed: ${orgErr?.message}` }, { status: 500 })
    }
    const orgId = (orgRow as { id: string }).id

    // ── 3. Create or invite admin user via Supabase Auth ──────────────────────
    let userId: string
    let inviteSent = false
    if (d.admin_password) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: d.admin_email,
        password: d.admin_password,
        email_confirm: true,
        user_metadata: { client_id: clientId, organization_id: orgId },
      })
      if (createErr || !created?.user) {
        return NextResponse.json({ error: `User create failed: ${createErr?.message}` }, { status: 500 })
      }
      userId = created.user.id
    } else {
      const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
        d.admin_email,
        {
          data: { client_id: clientId, organization_id: orgId },
          redirectTo: `${appUrl}/auth/callback`,
        }
      )
      if (inviteErr || !inviteData?.user) {
        return NextResponse.json({ error: `Invite failed: ${inviteErr?.message}` }, { status: 500 })
      }
      userId = inviteData.user.id
      inviteSent = true
    }

    // ── 4. Link user to organization ──────────────────────────────────────────
    const { error: ouErr } = await supabase.from('organization_users').insert({
      organization_id: orgId,
      user_id: userId,
      role: 'admin',
    })
    if (ouErr) {
      return NextResponse.json({ error: `organization_users insert failed: ${ouErr.message}` }, { status: 500 })
    }

    // ── 5. Create projects (optional at create — wizard can add later) ─────────
    let projectRows: Array<{
      id: string
      name: string
      project_code: string
      qr_identifier: string | null
    }> = []
    if (d.projects.length > 0) {
      const projectInserts = d.projects.map((p) => ({
        client_id: clientId,
        organization_id: orgId,
        name: p.name,
        project_code: p.project_code.toUpperCase(),
        address: p.address ?? null,
        qr_identifier: `START_${p.project_code.toUpperCase()}`,
        is_active: true,
      }))

      const { data: inserted, error: projectErr } = await supabase
        .from('projects')
        .insert(projectInserts)
        .select('id, name, project_code, qr_identifier')

      if (projectErr) {
        return NextResponse.json({ error: `Projects creation failed: ${projectErr.message}` }, { status: 500 })
      }
      projectRows = (inserted ?? []) as typeof projectRows
    }

    // ── 6. Create workers ─────────────────────────────────────────────────────
    let workersCreated: number = 0
    if (d.workers.length > 0) {
      const workerInserts: Array<{
        client_id: string
        organization_id: string
        full_name: string
        phone: string
        email: string | null
        role: string | null
        is_active: boolean
      }> = []
      for (const w of d.workers) {
        const phoneParsed = parseWorkerPhone(w.phone, 'מספר טלפון עובד')
        if (!phoneParsed.ok) {
          return NextResponse.json({ error: phoneParsed.error }, { status: 400 })
        }
        workerInserts.push({
          client_id: clientId,
          organization_id: orgId,
          full_name: w.full_name,
          phone: phoneParsed.normalized,
          email: w.email ?? null,
          role: w.role ?? null,
          is_active: true,
        })
      }
      const { data: workerData, error: workerErr } = await supabase
        .from('workers')
        .insert(workerInserts)
        .select('id')
      if (workerErr) {
        return NextResponse.json({ error: `Workers creation failed: ${workerErr.message}` }, { status: 500 })
      }
      workersCreated = workerData?.length ?? d.workers.length
    }

    // ── 7. Build QR links ─────────────────────────────────────────────────────
    const waPhone = d.whatsapp_business_phone?.replace(/[^0-9]/g, '') ?? ''
    const projects = ((projectRows ?? []) as Array<{
      id: string
      name: string
      project_code: string
      qr_identifier: string | null
    }>).map((p) => {
      const startCode = p.qr_identifier ?? `START_${p.project_code}`
      return {
        id: p.id,
        name: p.name,
        project_code: p.project_code,
        whatsapp_qr_url: waPhone
          ? `https://wa.me/${waPhone}?text=${encodeURIComponent(startCode)}`
          : null,
        report_url: appUrl
          ? `${appUrl}/report?project=${encodeURIComponent(p.project_code)}&client=${encodeURIComponent(clientId)}`
          : null,
      }
    })

    return NextResponse.json({
      ok: true,
      client_id: clientId,
      organization_id: orgId,
      admin_user_id: userId,
      admin_email: d.admin_email,
      invite_sent: inviteSent,
      password_set: Boolean(d.admin_password),
      workers_created: workersCreated,
      projects,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
