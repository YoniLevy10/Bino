import { createHash, randomInt } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { isWhatsAppPlaceholderResident } from '@/lib/residents-whatsapp'
import { sendResidentSMS } from '@/lib/sms-send'
import { logAudit } from '@/lib/audit'
import { BINO_PUBLIC_ORIGIN, getEnvPublicOrigin } from '@/lib/public-origin'

const OTP_TTL_MS = 10 * 60 * 1000
const MAX_SENDS_PER_PHONE_PER_HOUR = 3
const SYNTHETIC_EMAIL_DOMAIN = 'residents.bino.local'

export function residentAuthEmailFromPhone(normalizedPhone: string): string {
  return `r${normalizedPhone}@${SYNTHETIC_EMAIL_DOMAIN}`
}

/** Host for Apple/Android domain-bound SMS OTP (must match the site the resident opens). */
export function residentPortalOtpSmsHost(): string {
  const origin = getEnvPublicOrigin() || BINO_PUBLIC_ORIGIN
  try {
    return new URL(origin).hostname
  } catch {
    return 'bino.casa'
  }
}

/**
 * SMS copy for resident portal OTP.
 * Last line is Apple domain-bound format so iOS/Safari suggest “From Messages”.
 * @see https://developer.apple.com/documentation/security/enabling-autofill-for-domain-bound-sms-codes
 */
export function buildResidentPortalOtpSms(opts: {
  company: string
  code: string
  host?: string
}): string {
  const company = opts.company.trim() || 'BINO'
  const code = opts.code.trim()
  const host = (opts.host || residentPortalOtpSmsHost()).replace(/^www\./i, '')
  return `${company}: הסיסמה לכניסה לאזור האישי היא ${code}. בתוקף ל-10 דקות. אל תשתפו.\n\n@${host} #${code}`
}

function hashOtpCode(code: string, phone: string): string {
  return createHash('sha256').update(`${phone}:${code}`, 'utf8').digest('hex')
}

function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export type PhoneOtpRequestResult =
  | { ok: true; sent: true }
  | { ok: true; sent: false; reason: 'not_listed' | 'portal_disabled' | 'ambiguous' }
  | { ok: false; error: string; status: number }

/** Shown on the building link when the phone is not on that project's resident list. */
export const RESIDENT_PHONE_NOT_REGISTERED_ERROR =
  'לא ניתן להיכנס — המספר אינו רשום בבניין זה. פנו לחברת הניהול.'

export const RESIDENT_PHONE_OTP_SENT_MESSAGE = 'נשלחה סיסמה מספרית ב-SMS.'

/**
 * Public HTTP body for the building-link OTP request.
 * An unregistered phone is an error — entry is only for numbers on that building's list.
 */
export function residentPhoneOtpHttpResult(result: PhoneOtpRequestResult): {
  status: number
  body: { ok?: true; message?: string; error?: string }
} {
  if (!result.ok) return { status: result.status, body: { error: result.error } }
  if (!result.sent) {
    if (result.reason === 'portal_disabled') {
      return { status: 403, body: { error: 'פורטל הדיירים אינו פעיל בבניין זה' } }
    }
    if (result.reason === 'ambiguous') {
      return {
        status: 409,
        body: { error: 'המספר משויך ליותר מדירה אחת — פנו לחברת הניהול' },
      }
    }
    return { status: 403, body: { error: RESIDENT_PHONE_NOT_REGISTERED_ERROR } }
  }
  return { status: 200, body: { ok: true, message: RESIDENT_PHONE_OTP_SENT_MESSAGE } }
}

/**
 * Building-link login step 1: match phone → resident in that project → SMS OTP.
 * Unregistered phones stay `not_listed`; the HTTP layer returns an error for them.
 */
export async function requestResidentPhoneOtp(
  admin: SupabaseClient,
  opts: { projectId: string; phoneRaw: string }
): Promise<PhoneOtpRequestResult> {
  const normalized = normalizePhone(opts.phoneRaw.trim())
  if (!normalized || normalized.length < 10) {
    return { ok: false, error: 'מספר טלפון לא תקין', status: 400 }
  }

  const { data: project, error: pErr } = await admin
    .from('projects')
    .select('id, client_id, name, resident_portal_enabled')
    .eq('id', opts.projectId)
    .maybeSingle()

  if (pErr) return { ok: false, error: pErr.message, status: 500 }
  if (!project) return { ok: false, error: 'פרויקט לא נמצא', status: 404 }
  if (!project.resident_portal_enabled) {
    return { ok: true, sent: false, reason: 'portal_disabled' }
  }

  const { data: matches, error: rErr } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone, unit_id, is_renter, project_id, client_id')
    .eq('client_id', project.client_id)
    .eq('project_id', project.id)
    .eq('normalized_phone', normalized)
    .is('deleted_at', null)
    .limit(5)

  if (rErr) return { ok: false, error: rErr.message, status: 500 }

  const residents = (matches ?? []).filter((r) => !isWhatsAppPlaceholderResident(r))
  if (residents.length === 0) {
    return { ok: true, sent: false, reason: 'not_listed' }
  }
  if (residents.length > 1) {
    return { ok: true, sent: false, reason: 'ambiguous' }
  }

  const resident = residents[0]

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: cErr } = await admin
    .from('resident_portal_phone_otps')
    .select('id', { count: 'exact', head: true })
    .eq('normalized_phone', normalized)
    .eq('project_id', project.id)
    .gte('created_at', hourAgo)

  if (cErr) return { ok: false, error: cErr.message, status: 500 }
  if ((count ?? 0) >= MAX_SENDS_PER_PHONE_PER_HOUR) {
    return { ok: false, error: 'נשלחו יותר מדי קודים — נסו שוב בעוד שעה', status: 429 }
  }

  const code = generateSixDigitCode()
  const codeHash = hashOtpCode(code, normalized)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Invalidate previous open codes for this phone+project
  await admin
    .from('resident_portal_phone_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('normalized_phone', normalized)
    .eq('project_id', project.id)
    .is('consumed_at', null)

  const { error: iErr } = await admin.from('resident_portal_phone_otps').insert({
    client_id: project.client_id,
    project_id: project.id,
    resident_id: resident.id,
    normalized_phone: normalized,
    code_hash: codeHash,
    expires_at: expiresAt,
  })

  if (iErr) return { ok: false, error: iErr.message, status: 500 }

  const { data: clientRow } = await admin
    .from('clients')
    .select('sms_sender_name, display_name, name')
    .eq('id', project.client_id)
    .maybeSingle()

  // Client 019 sender phone only — alphanumeric names are stripped in resolve019SmsSource.
  const sender =
    (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null
  const company =
    (clientRow as { display_name?: string | null; name?: string | null } | null)?.display_name?.trim() ||
    (clientRow as { name?: string | null } | null)?.name?.trim() ||
    'BINO'

  const smsBody = buildResidentPortalOtpSms({ company, code })
  const sent = await sendResidentSMS(normalized, smsBody, sender, project.client_id)
  if (!sent) {
    return { ok: false, error: 'שליחת SMS נכשלה — נסו שוב', status: 502 }
  }

  await logAudit({
    clientId: project.client_id,
    userId: null,
    action: 'portal_phone_otp_sent',
    entityType: 'resident',
    entityId: resident.id,
    newValues: { project_id: project.id, phone_suffix: normalized.slice(-4) },
  })

  return { ok: true, sent: true }
}

export type PhoneOtpVerifyResult =
  | {
      ok: true
      membershipId: string
      email: string
      tokenHash: string
    }
  | { ok: false; error: string; status: number }

/**
 * Shared-link login step 2: verify SMS code → ensure Auth user + membership → session token.
 */
export async function verifyResidentPhoneOtp(
  admin: SupabaseClient,
  opts: { projectId: string; phoneRaw: string; code: string }
): Promise<PhoneOtpVerifyResult> {
  const normalized = normalizePhone(opts.phoneRaw.trim())
  const code = opts.code.replace(/\D/g, '')
  if (!normalized || code.length !== 6) {
    return { ok: false, error: 'קוד או טלפון לא תקינים', status: 400 }
  }

  const { data: project } = await admin
    .from('projects')
    .select('id, client_id, resident_portal_enabled')
    .eq('id', opts.projectId)
    .maybeSingle()

  if (!project?.resident_portal_enabled) {
    return { ok: false, error: 'הפורטל אינו פעיל בפרויקט זה', status: 403 }
  }

  const { data: otpRow, error: oErr } = await admin
    .from('resident_portal_phone_otps')
    .select('*')
    .eq('project_id', project.id)
    .eq('normalized_phone', normalized)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (oErr) return { ok: false, error: oErr.message, status: 500 }
  if (!otpRow) return { ok: false, error: 'לא נמצא קוד פעיל — בקשו קוד חדש', status: 400 }
  if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'הקוד פג תוקף — בקשו קוד חדש', status: 400 }
  }
  if (otpRow.attempts >= otpRow.max_attempts) {
    return { ok: false, error: 'יותר מדי ניסיונות — בקשו קוד חדש', status: 429 }
  }

  const expected = hashOtpCode(code, normalized)
  if (expected !== otpRow.code_hash) {
    await admin
      .from('resident_portal_phone_otps')
      .update({ attempts: otpRow.attempts + 1 })
      .eq('id', otpRow.id)
    return { ok: false, error: 'קוד שגוי', status: 401 }
  }

  await admin
    .from('resident_portal_phone_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', otpRow.id)

  const { data: resident, error: rErr } = await admin
    .from('residents')
    .select('id, unit_id, is_renter, client_id, project_id, full_name')
    .eq('id', otpRow.resident_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (rErr || !resident) {
    return { ok: false, error: 'דייר לא נמצא', status: 404 }
  }

  const email = residentAuthEmailFromPhone(normalized)
  const userId = await ensureResidentAuthUser(admin, {
    email,
    phone: normalized,
    fullName: resident.full_name,
  })

  const role = resident.is_renter ? 'renter' : 'owner'

  // Upsert active membership
  await admin
    .from('resident_portal_memberships')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('resident_id', resident.id)
    .eq('status', 'active')

  const { data: membership, error: mErr } = await admin
    .from('resident_portal_memberships')
    .insert({
      user_id: userId,
      resident_id: resident.id,
      unit_id: resident.unit_id,
      client_id: resident.client_id,
      project_id: resident.project_id,
      role,
      status: 'active',
    })
    .select('id')
    .single()

  if (mErr || !membership) {
    return { ok: false, error: mErr?.message || 'יצירת חברות נכשלה', status: 500 }
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkErr) {
    return { ok: false, error: linkErr.message, status: 500 }
  }

  const props = (linkData as { properties?: { hashed_token?: string } })?.properties
  const tokenHash = props?.hashed_token
  if (!tokenHash) {
    return { ok: false, error: 'יצירת סשן נכשלה', status: 500 }
  }

  await logAudit({
    clientId: project.client_id,
    userId,
    action: 'portal_phone_otp_verified',
    entityType: 'resident_portal_membership',
    entityId: membership.id,
    newValues: { resident_id: resident.id, project_id: project.id },
  })

  return {
    ok: true,
    membershipId: membership.id,
    email,
    tokenHash,
  }
}

async function ensureResidentAuthUser(
  admin: SupabaseClient,
  opts: { email: string; phone: string; fullName: string | null }
): Promise<string> {
  // Try create; if exists, look up by email via generateLink / list is heavy — use getUserByEmail if available
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    user_metadata: {
      resident_portal: true,
      phone: opts.phone,
      full_name: opts.fullName,
    },
  })

  if (created?.user?.id) return created.user.id

  // Already exists
  const msg = createErr?.message || ''
  if (/already|exists|registered/i.test(msg)) {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: opts.email,
    })
    if (linkErr) throw new Error(linkErr.message)
    const uid = (linkData as { user?: { id?: string } })?.user?.id
    if (uid) return uid
    throw new Error('משתמש קיים אך לא ניתן לטעון מזהה')
  }

  throw new Error(createErr?.message || 'יצירת משתמש נכשלה')
}
