import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import { formatZodError } from '@/lib/errors/format-zod-error'
import { bankMatchRemindersBodySchema } from '@/lib/api-body-schemas'
import { isBankMatchPocEnabled } from '@/lib/bank-match/flags'
import { sendResidentSMS } from '@/lib/sms/sms-send'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: Request) {
  if (!isBankMatchPocEnabled()) {
    return NextResponse.json({ error: 'מודול התאמות בנק כבוי', code: 'BANK_MATCH_DISABLED' }, { status: 503 })
  }
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'bank-match-reminders'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }
  const parsed = bankMatchRemindersBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
  }

  const { project_id, charge_ids } = parsed.data

  const { data: clientRow } = await admin
    .from('clients')
    .select('id, sms_sender_name, name')
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  const { data: bankAcct } = await admin
    .from('building_bank_accounts')
    .select('bank_code, branch_number, account_number, bban, iban, display_name')
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', project_id)
    .eq('is_active', true)
    .maybeSingle()

  let q = admin
    .from('collection_charges')
    .select(
      `id, title, amount, payment_reference, gap_reminder_sent_at, status,
       residents ( full_name, phone, normalized_phone, apartment_number )`
    )
    .eq('client_id', auth.ctx.clientId)
    .eq('project_id', project_id)
    .in('status', ['sent', 'draft'])
    .is('bank_transaction_id', null)
    .limit(100)

  if (charge_ids?.length) {
    q = q.in('id', charge_ids)
  }

  const { data: charges, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const accountHint = bankAcct?.bban || bankAcct?.iban ||
    [bankAcct?.bank_code, bankAcct?.branch_number, bankAcct?.account_number]
      .filter(Boolean)
      .join('-') || 'חשבון הוועד'

  const now = Date.now()
  let sent = 0
  let skipped = 0
  const failures: string[] = []

  for (const ch of charges || []) {
    const last = ch.gap_reminder_sent_at
      ? new Date(String(ch.gap_reminder_sent_at)).getTime()
      : 0
    if (last && now - last < COOLDOWN_MS) {
      skipped++
      continue
    }
    const res = ch.residents as
      | { full_name?: string; phone?: string | null; normalized_phone?: string | null }
      | { full_name?: string; phone?: string | null; normalized_phone?: string | null }[]
      | null
    const r = Array.isArray(res) ? res[0] : res
    // Local/QA only: force recipient (e.g. Bamakor manager) when demo resident phones are invalid.
    const testTo = (process.env.BANK_MATCH_TEST_SMS_TO || '').trim()
    const phone = (testTo || r?.normalized_phone || r?.phone || '').trim()
    if (!phone) {
      skipped++
      continue
    }
    const ref = (ch.payment_reference as string) || ''
    const body = [
      `שלום ${r?.full_name || 'דייר/ת'},`,
      `נמצא פער בגבייה: ${ch.title} בסך ${Number(ch.amount).toFixed(2)} שח.`,
      `נא להעביר לחשבון הוועד (${accountHint}).`,
      ref ? `ציינו באסמכתא: ${ref}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const ok = await sendResidentSMS(
      phone,
      body,
      clientRow?.sms_sender_name ?? null,
      auth.ctx.clientId
    )
    if (ok) {
      sent++
      await admin
        .from('collection_charges')
        .update({ gap_reminder_sent_at: new Date().toISOString() })
        .eq('id', ch.id)
    } else {
      failures.push(String(ch.id))
    }
  }

  await logAudit({
    clientId: auth.ctx.clientId,
    userId: auth.ctx.userId,
    action: 'bank_match.gap_reminders',
    entityType: 'project',
    entityId: project_id,
    newValues: { sent, skipped, failures: failures.length },
  })

  return NextResponse.json({ ok: true, sent, skipped, failures })
}
