#!/usr/bin/env node
/**
 * Seed Hub QA demo data for ONE tenant (finance / reports / committee /
 * decisions / residents / resident-portal surfaces). Idempotent: clears previous
 * [DEMO] / demo-hub-qa rows on the dedicated demo project, then re-inserts.
 *
 * Prefer client סביון (override with --client-id). Reassigns project DEMO_QA_HUB
 * onto that client so it appears on the manager /projects list.
 *
 * Direct service-role writes only — no SMS / WhatsApp / email / notify paths.
 *
 * Usage:
 *   node scripts/seed-hub-qa-demo.mjs
 *   node scripts/seed-hub-qa-demo.mjs --dry-run
 *   node scripts/seed-hub-qa-demo.mjs --client-id <uuid>
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Wipe later: re-run this script, or delete project_code DEMO_QA_HUB + tagged rows.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DEMO_TAG = '[DEMO]'
const DEMO_PROJECT_CODE = 'DEMO_QA_HUB'
const DEMO_PROJECT_NAME = '[DEMO] בניין QA Hub'
const IDEM_PREFIX = 'demo-hub-qa'
const YEAR = new Date().getFullYear()
const PREFERRED_DEMO_PHONE = '0500000101'

const CATEGORIES = [
  { key: 'cleaning', name_he: 'ניקיון', sort_order: 10 },
  { key: 'elevator', name_he: 'מעליות', sort_order: 20 },
  { key: 'electricity', name_he: 'חשמל', sort_order: 30 },
  { key: 'water', name_he: 'מים וביוב', sort_order: 40 },
  { key: 'gardening', name_he: 'גינון', sort_order: 50 },
  { key: 'insurance', name_he: 'ביטוח', sort_order: 60 },
  { key: 'security', name_he: 'אבטחה', sort_order: 70 },
  { key: 'maintenance', name_he: 'תחזוקה כללית', sort_order: 80 },
]

const LAST_NAMES = [
  'כהן',
  'לוי',
  'מזרחי',
  'פרץ',
  'אברהם',
  'שמעון',
  'גולן',
  'בן דוד',
  'חדד',
  'אוחיון',
  'ביטון',
  'אשכנזי',
  'דנון',
  'עמר',
  'סבג',
  'מלכה',
  'זאדה',
  'נחום',
  'שטרית',
  'אלון',
  'רוזן',
  'ברק',
  'ישראל',
  'כהן־לוי',
]

function buildResidents() {
  const rows = []
  for (let i = 1; i <= 24; i++) {
    const phoneSuffix = String(100 + i).padStart(3, '0')
    const phone = `0500000${phoneSuffix}`
    const norm = `972500000${phoneSuffix}`
    const female = i % 2 === 0
    rows.push({
      apt: String(i),
      name: `${female ? 'דיירת' : 'דייר'} DEMO ${LAST_NAMES[(i - 1) % LAST_NAMES.length]}`,
      phone,
      norm,
    })
  }
  return rows
}

const RESIDENTS = buildResidents()

const COMMITTEE = [
  { full_name: 'יו״ר DEMO דנה כהן', role: 'chair', phone: '0500000201', email: 'demo-chair@example.test' },
  { full_name: 'גזבר DEMO אורי לוי', role: 'treasurer', phone: '0500000202', email: 'demo-treasurer@example.test' },
  { full_name: 'מזכיר DEMO יעל מזרחי', role: 'secretary', phone: '0500000203', email: 'demo-secretary@example.test' },
  { full_name: 'חבר DEMO נועם פרץ', role: 'member', phone: '0500000204', email: null },
  { full_name: 'חותם DEMO שירה בן דוד', role: 'signer', phone: '0500000205', email: null },
]

const AMENITIES = [
  {
    name: `${DEMO_TAG} חדר כושר`,
    description: 'ציוד קרדיו ומכונות כוח לדיירי הבניין',
    guidelines: 'נא לנעול נעלי ספורט · אין להשאיר מגבות',
    sort_order: 10,
    hours: { opens: '06:00', closes: '22:00', closedDays: [] },
  },
  {
    name: `${DEMO_TAG} גינה משותפת`,
    description: 'דשא, ספסלים ופינת משחקים',
    guidelines: 'כלבים ברצועה בלבד',
    sort_order: 20,
    hours: { opens: '07:00', closes: '20:00', closedDays: [] },
  },
  {
    name: `${DEMO_TAG} חדר כביסה`,
    description: 'מכונות כביסה ומייבשים',
    guidelines: 'הזמנה עד 90 דקות',
    sort_order: 30,
    hours: { opens: '08:00', closes: '21:00', closedDays: [6] },
  },
  {
    name: `${DEMO_TAG} חדר אופניים`,
    description: 'אחסון אופניים וקורקינטים',
    guidelines: 'תיוג שם + דירה',
    sort_order: 40,
    hours: { opens: '00:00', closes: '23:59', closedDays: [] },
  },
  {
    name: `${DEMO_TAG} לובי / חדר ועד`,
    description: 'מפגשי ועד ואיסוף חבילות',
    guidelines: 'בתיאום עם הוועד',
    sort_order: 50,
    hours: { opens: '09:00', closes: '18:00', closedDays: [5, 6] },
  },
]

const ANNOUNCEMENTS = [
  {
    title: `${DEMO_TAG} תחזוקת מעלית ביום ג׳`,
    body: 'המעלית תהיה מחוץ לשירות ביום שלישי 09:00–12:00 לצורך בדיקה שנתית.',
    is_pinned: true,
  },
  {
    title: `${DEMO_TAG} גביית ועד חודש נוכחי`,
    body: 'ניתן לשלם באפליקציה / פורטל דיירים. פיגור מעבר ל־15 בחודש יגרור תזכורת.',
    is_pinned: false,
  },
  {
    title: `${DEMO_TAG} ניקיון חניון תת־קרקעי`,
    body: 'ביום חמישי יישטף החניון — אנא פנו רכבים בין 08:00–11:00.',
    is_pinned: false,
  },
  {
    title: `${DEMO_TAG} עדכון שעות חדר כושר`,
    body: 'חדר הכושר פתוח כעת עד 22:00 בימי חול.',
    is_pinned: false,
  },
  {
    title: `${DEMO_TAG} אסיפת דיירים — טיוטה`,
    body: 'טיוטת סדר יום לאסיפה תפורסם השבוע. נא לעקוב אחר הודעות נוספות.',
    is_pinned: false,
  },
  {
    title: `${DEMO_TAG} איסוף גזם`,
    body: 'פינוי גזם מהגינה המשותפת ביום ראשון בבוקר.',
    is_pinned: false,
  },
  {
    title: `${DEMO_TAG} עדכון פרטי קשר ועד`,
    body: 'לפניות דחופות לוועד — השתמשו בצ׳אט הפורטל או בטלפון המופיע במידע הבניין.',
    is_pinned: false,
  },
  {
    title: `${DEMO_TAG} בדיקת מערכת גילוי אש`,
    body: 'בדיקה חודשית קצרה בלובי — ייתכנו אזעקות ניסיון במשך כ־10 דקות.',
    is_pinned: false,
  },
]

/** ~48 expenses across months / categories / payment statuses for reports KPIs. */
function buildExpenses(clientId, projectId, categoryByKey) {
  const vendors = [
    'DEMO ניקיון פלוס',
    'DEMO מעליות תל אביב',
    'DEMO חשמלאי מהיר',
    'DEMO אינסטלציה זהב',
    'DEMO גינון ירוק',
    'DEMO ביטוח בניין',
    'DEMO אבטחה 24',
    'DEMO תחזוקה כללית',
  ]
  const statuses = ['paid', 'paid', 'paid', 'partial', 'unpaid', 'paid', 'void', 'unpaid']
  const catKeys = CATEGORIES.map((c) => c.key)
  const rows = []
  for (let i = 1; i <= 48; i++) {
    const month = ((i - 1) % 11) + 1 // Jan–Nov
    const day = Math.min(28, 1 + ((i * 3) % 27))
    const catKey = catKeys[(i - 1) % catKeys.length]
    const amount = Number((180 + i * 97 + (i % 5) * 40).toFixed(2))
    const status = statuses[(i - 1) % statuses.length]
    const expenseDate = `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const periodKey = `${YEAR}-${String(month).padStart(2, '0')}`
    rows.push({
      client_id: clientId,
      project_id: projectId,
      category_id: categoryByKey[catKey]?.id ?? null,
      vendor_name: vendors[(i - 1) % vendors.length],
      amount,
      currency: 'ILS',
      expense_date: expenseDate,
      description: `${DEMO_TAG} הוצאה QA #${i} — ${categoryByKey[catKey]?.name_he || catKey}`,
      payment_status: status,
      budget_period_key: periodKey,
      idempotency_key: `${IDEM_PREFIX}-exp-${String(i).padStart(2, '0')}`,
      voided_at: status === 'void' ? new Date().toISOString() : null,
      void_reason: status === 'void' ? `${DEMO_TAG} בוטל לדוגמה` : null,
    })
  }
  return rows
}

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

function parseArgs(argv) {
  let dryRun = false
  let clientId = (process.env.QA_HUB_CLIENT_ID || process.env.BAMAKOR_CLIENT_ID || '').trim()
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') dryRun = true
    else if (a === '--client-id' && argv[i + 1]) clientId = argv[++i]
  }
  return { dryRun, clientId }
}

async function resolveClientId(sb, preferred) {
  if (preferred) {
    const { data, error } = await sb.from('clients').select('id, name').eq('id', preferred).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error(`client_id not found: ${preferred}`)
    return data
  }
  // Default: סביון (owner QA target), then Bamakor fallback.
  const { data: savion, error: sErr } = await sb
    .from('clients')
    .select('id, name')
    .ilike('name', '%סביון%')
    .limit(2)
  if (sErr) throw new Error(sErr.message)
  if (savion?.length === 1) return savion[0]
  if (savion?.length > 1) {
    throw new Error(`Ambiguous סביון match (${savion.length}); pass --client-id explicitly`)
  }

  const { data, error } = await sb
    .from('clients')
    .select('id, name')
    .or('name.ilike.Bamakor,name.ilike.%במקור%')
    .limit(2)
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('סביון/Bamakor client not found — pass --client-id')
  if (data.length > 1) {
    throw new Error(`Ambiguous Bamakor match (${data.length}); pass --client-id explicitly`)
  }
  return data[0]
}

async function resolveOrgIdForClient(sb, clientId) {
  const { data } = await sb
    .from('projects')
    .select('organization_id')
    .eq('client_id', clientId)
    .not('organization_id', 'is', null)
    .limit(1)
    .maybeSingle()
  return data?.organization_id ?? null
}

/**
 * Find DEMO_QA_HUB globally; create or reassign onto target client.
 */
async function ensureDemoProject(sb, clientId, organizationId, dryRun) {
  const { data: byCode, error } = await sb
    .from('projects')
    .select('id, name, project_code, client_id, organization_id, is_active, resident_portal_enabled')
    .eq('project_code', DEMO_PROJECT_CODE)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (byCode) {
    const needsReassign = byCode.client_id !== clientId
    const needsMeta =
      !byCode.is_active ||
      byCode.name !== DEMO_PROJECT_NAME ||
      !byCode.resident_portal_enabled ||
      (organizationId && byCode.organization_id !== organizationId)
    if (!dryRun && (needsReassign || needsMeta)) {
      const patch = {
        client_id: clientId,
        name: DEMO_PROJECT_NAME,
        is_active: true,
        address: 'רחוב DEMO 1, סביון',
        address_en: 'DEMO St 1, Savion',
        resident_portal_enabled: true,
        resident_portal_contact_phone: '0500000201',
        resident_portal_contact_email: 'demo-chair@example.test',
      }
      if (organizationId) patch.organization_id = organizationId
      const { error: uErr } = await sb.from('projects').update(patch).eq('id', byCode.id)
      if (uErr) throw new Error(`reassign project: ${uErr.message}`)
      console.log(
        needsReassign
          ? `Reassigned project ${byCode.id} → client ${clientId}`
          : `Updated demo project metadata ${byCode.id}`
      )
    }
    return { id: byCode.id, previousClientId: byCode.client_id }
  }

  if (dryRun) return { id: null, previousClientId: null }

  const { data: created, error: cErr } = await sb
    .from('projects')
    .insert({
      client_id: clientId,
      organization_id: organizationId,
      name: DEMO_PROJECT_NAME,
      project_code: DEMO_PROJECT_CODE,
      address: 'רחוב DEMO 1, סביון',
      address_en: 'DEMO St 1, Savion',
      qr_identifier: `START_${DEMO_PROJECT_CODE}`,
      is_active: true,
      resident_portal_enabled: true,
      resident_portal_contact_phone: '0500000201',
      resident_portal_contact_email: 'demo-chair@example.test',
    })
    .select('id')
    .single()
  if (cErr) throw new Error(cErr.message)
  return { id: created.id, previousClientId: null }
}

async function delSelect(query) {
  const { data, error } = await query.select('id')
  if (error) throw error
  return data?.length ?? 0
}

async function wipeDemoRows(sb, projectId, dryRun) {
  const counts = {}
  if (dryRun) {
    return {
      decision_recipients: 'dry-run',
      signature_requests: 'dry-run',
      decisions: 'dry-run',
      committee: 'dry-run',
      expenses: 'dry-run',
      budgets: 'dry-run',
      charges: 'dry-run',
      tickets: 'dry-run',
      announcement_audience: 'dry-run',
      announcements: 'dry-run',
      amenity_children: 'dry-run',
      amenities: 'dry-run',
      documents: 'dry-run',
      residents: 'dry-run',
    }
  }

  try {
    // Order matters for FKs. Scoped by project_id so reassignment still cleans old client rows.
    counts.decision_recipients = await delSelect(
      sb
        .from('building_decision_recipients')
        .delete()
        .eq('project_id', projectId)
        .like('portal_path', `${IDEM_PREFIX}%`)
    )
    counts.signature_requests = await delSelect(
      sb
        .from('building_signature_requests')
        .delete()
        .eq('project_id', projectId)
        .like('token', `${IDEM_PREFIX}-sig-%`)
    )
    counts.decisions = await delSelect(
      sb.from('building_decisions').delete().eq('project_id', projectId).like('title', `${DEMO_TAG}%`)
    )
    counts.committee = await delSelect(
      sb
        .from('building_committee_members')
        .delete()
        .eq('project_id', projectId)
        .like('notes', `${DEMO_TAG}%`)
    )
    counts.expenses = await delSelect(
      sb
        .from('building_expenses')
        .delete()
        .eq('project_id', projectId)
        .like('idempotency_key', `${IDEM_PREFIX}-exp-%`)
    )
    counts.budgets = await delSelect(
      sb.from('building_budgets').delete().eq('project_id', projectId).like('notes', `${DEMO_TAG}%`)
    )
    counts.charges = await delSelect(
      sb
        .from('collection_charges')
        .delete()
        .eq('project_id', projectId)
        .like('idempotency_key', `${IDEM_PREFIX}-chg-%`)
    )
    // Also wipe demo charges by title if idempotency filter missed older rows
    counts.charges_by_title = await delSelect(
      sb
        .from('collection_charges')
        .delete()
        .eq('project_id', projectId)
        .like('title', `${DEMO_TAG}%`)
    )
    counts.tickets = await delSelect(
      sb
        .from('tickets')
        .delete()
        .eq('project_id', projectId)
        .like('portal_idempotency_key', `${IDEM_PREFIX}-tkt-%`)
    )

    const { data: anns, error: aErr } = await sb
      .from('project_announcements')
      .select('id')
      .eq('project_id', projectId)
      .like('title', `${DEMO_TAG}%`)
    if (aErr) throw aErr
    const annIds = (anns || []).map((a) => a.id)
    if (annIds.length) {
      counts.announcement_audience = await delSelect(
        sb.from('project_announcement_audience').delete().in('announcement_id', annIds)
      )
    } else {
      counts.announcement_audience = 0
    }
    counts.announcements = await delSelect(
      sb
        .from('project_announcements')
        .delete()
        .eq('project_id', projectId)
        .like('title', `${DEMO_TAG}%`)
    )

    const { data: ams, error: amErr } = await sb
      .from('project_amenities')
      .select('id')
      .eq('project_id', projectId)
      .like('name', `${DEMO_TAG}%`)
    if (amErr) throw amErr
    const amIds = (ams || []).map((a) => a.id)
    if (amIds.length) {
      await sb.from('project_amenity_exceptions').delete().in('amenity_id', amIds)
      counts.amenity_children = await delSelect(
        sb.from('project_amenity_hours').delete().in('amenity_id', amIds)
      )
    } else {
      counts.amenity_children = 0
    }
    counts.amenities = await delSelect(
      sb.from('project_amenities').delete().eq('project_id', projectId).like('name', `${DEMO_TAG}%`)
    )
    counts.documents = await delSelect(
      sb.from('project_documents').delete().eq('project_id', projectId).like('notes', `${DEMO_TAG}%`)
    )
    counts.residents = await delSelect(
      sb.from('residents').delete().eq('project_id', projectId).like('notes', `${DEMO_TAG}%`)
    )
  } catch (e) {
    throw new Error(`wipe failed: ${e instanceof Error ? e.message : e}`)
  }
  return counts
}

async function enableFinanceAddon(sb, clientId, dryRun) {
  const now = new Date().toISOString()
  if (!dryRun) {
    const { error } = await sb.from('client_paid_addons').upsert(
      {
        client_id: clientId,
        addon_key: 'building_finance',
        enabled: true,
        enabled_at: now,
        notes: `${DEMO_TAG} hub QA seed`,
        updated_at: now,
      },
      { onConflict: 'client_id,addon_key' }
    )
    if (error) throw new Error(`addon upsert: ${error.message}`)

    const { data: clientRow, error: cErr } = await sb
      .from('clients')
      .select('enabled_nav_features')
      .eq('id', clientId)
      .maybeSingle()
    if (cErr) throw new Error(cErr.message)
    const nav = Array.isArray(clientRow?.enabled_nav_features)
      ? [...clientRow.enabled_nav_features]
      : null
    if (nav) {
      for (const id of ['finance', 'reports', 'projects', 'collections', 'project_documents']) {
        if (!nav.includes(id)) nav.push(id)
      }
      const { error: nErr } = await sb
        .from('clients')
        .update({ enabled_nav_features: nav })
        .eq('id', clientId)
      if (nErr) throw new Error(`nav update: ${nErr.message}`)
    }
  }
  return { building_finance: true, nav: ['finance', 'reports'] }
}

async function ensureCategories(sb, clientId, dryRun) {
  const byKey = {}
  for (const cat of CATEGORIES) {
    const { data: existing } = await sb
      .from('building_expense_categories')
      .select('id, key, name_he')
      .eq('client_id', clientId)
      .eq('key', cat.key)
      .is('project_id', null)
      .maybeSingle()
    if (existing) {
      byKey[cat.key] = existing
      continue
    }
    if (dryRun) {
      byKey[cat.key] = { id: null, ...cat }
      continue
    }
    const { data, error } = await sb
      .from('building_expense_categories')
      .insert({
        client_id: clientId,
        project_id: null,
        key: cat.key,
        name_he: cat.name_he,
        is_system: true,
        sort_order: cat.sort_order,
      })
      .select('id, key, name_he')
      .single()
    if (error) throw new Error(`category ${cat.key}: ${error.message}`)
    byKey[cat.key] = data
  }
  return byKey
}

async function main() {
  loadEnvLocal()
  const { dryRun, clientId: preferred } = parseArgs(process.argv)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const client = await resolveClientId(sb, preferred || undefined)
  console.log(`Client: ${client.name} (${client.id})${dryRun ? ' [dry-run]' : ''}`)

  const organizationId = await resolveOrgIdForClient(sb, client.id)
  console.log(`Organization: ${organizationId || '(none)'}`)

  const { id: projectId, previousClientId } = await ensureDemoProject(
    sb,
    client.id,
    organizationId,
    dryRun
  )
  console.log(
    `Project: ${DEMO_PROJECT_NAME} / ${DEMO_PROJECT_CODE} → ${projectId || '(would create)'}` +
      (previousClientId && previousClientId !== client.id
        ? ` (was client ${previousClientId})`
        : '')
  )

  if (!projectId && !dryRun) {
    console.error('Failed to resolve demo project id')
    process.exit(1)
  }

  const wipeCounts = projectId
    ? await wipeDemoRows(sb, projectId, dryRun)
    : { skipped: 'no project yet' }
  console.log('Wipe previous demo:', wipeCounts)

  const addon = await enableFinanceAddon(sb, client.id, dryRun)
  console.log('Addon/nav:', addon)

  const categoryByKey = await ensureCategories(sb, client.id, dryRun)
  console.log(`Categories ready: ${Object.keys(categoryByKey).length}`)

  const inserted = {
    expenses: 0,
    budgets: 0,
    residents: 0,
    committee: 0,
    decisions: 0,
    signatures: 0,
    decision_recipients: 0,
    announcements: 0,
    amenities: 0,
    amenity_hours: 0,
    charges: 0,
    tickets: 0,
    documents: 0,
  }

  if (!dryRun && projectId) {
    // Re-stamp any leftover child rows that wipe missed (non-demo tagged) onto new client.
    // Only demo-tagged tables are wiped; project.client_id already updated.

    const expenseRows = buildExpenses(client.id, projectId, categoryByKey)
    const { data: expData, error: expErr } = await sb
      .from('building_expenses')
      .upsert(expenseRows, { onConflict: 'client_id,idempotency_key' })
      .select('id')
    if (expErr) throw new Error(`expenses: ${expErr.message}`)
    inserted.expenses = expData?.length ?? 0

    const budgetRows = [
      {
        client_id: client.id,
        project_id: projectId,
        period_key: String(YEAR),
        category_id: null,
        amount_planned: 140000,
        currency: 'ILS',
        notes: `${DEMO_TAG} תקציב שנתי QA`,
      },
      {
        client_id: client.id,
        project_id: projectId,
        period_key: `${YEAR}-Q4`,
        category_id: null,
        amount_planned: 18000,
        currency: 'ILS',
        notes: `${DEMO_TAG} תקציב רבעון 4 (צפוף — over_pace)`,
      },
      {
        client_id: client.id,
        project_id: projectId,
        period_key: String(YEAR),
        category_id: categoryByKey.cleaning?.id ?? null,
        amount_planned: 24000,
        currency: 'ILS',
        notes: `${DEMO_TAG} תקציב ניקיון שנתי`,
      },
      {
        client_id: client.id,
        project_id: projectId,
        period_key: String(YEAR),
        category_id: categoryByKey.elevator?.id ?? null,
        amount_planned: 28000,
        currency: 'ILS',
        notes: `${DEMO_TAG} תקציב מעליות שנתי`,
      },
      {
        client_id: client.id,
        project_id: projectId,
        period_key: String(YEAR),
        category_id: categoryByKey.gardening?.id ?? null,
        amount_planned: 12000,
        currency: 'ILS',
        notes: `${DEMO_TAG} תקציב גינון שנתי`,
      },
      {
        client_id: client.id,
        project_id: projectId,
        period_key: String(YEAR),
        category_id: categoryByKey.security?.id ?? null,
        amount_planned: 16000,
        currency: 'ILS',
        notes: `${DEMO_TAG} תקציב אבטחה שנתי`,
      },
    ].filter((r) => r.category_id !== null || r.notes.includes('תקציב שנתי QA') || r.notes.includes('רבעון'))

    const { data: budData, error: budErr } = await sb.from('building_budgets').insert(budgetRows).select('id')
    if (budErr) throw new Error(`budgets: ${budErr.message}`)
    inserted.budgets = budData?.length ?? 0

    const residentRows = RESIDENTS.map((r) => ({
      client_id: client.id,
      project_id: projectId,
      full_name: r.name,
      phone: r.phone,
      normalized_phone: r.norm,
      apartment_number: r.apt,
      notes: `${DEMO_TAG} דייר QA Hub — לא לשלוח הודעות`,
      is_renter: false,
    }))
    const { data: resData, error: resErr } = await sb.from('residents').insert(residentRows).select('id, full_name, phone, apartment_number')
    if (resErr) throw new Error(`residents: ${resErr.message}`)
    inserted.residents = resData?.length ?? 0
    const residentIds = (resData || []).map((r) => r.id)
    const demoResident = (resData || []).find((r) => r.phone === PREFERRED_DEMO_PHONE) || resData?.[0]

    const committeeRows = COMMITTEE.map((m, idx) => ({
      client_id: client.id,
      project_id: projectId,
      resident_id: residentIds[idx] ?? null,
      full_name: m.full_name,
      role: m.role,
      phone: m.phone,
      email: m.email,
      term_start: `${YEAR}-01-01`,
      term_end: `${YEAR}-12-31`,
      is_active: true,
      notes: `${DEMO_TAG} ועד QA — ללא שליחת הזמנות`,
    }))
    const { data: comData, error: comErr } = await sb
      .from('building_committee_members')
      .insert(committeeRows)
      .select('id')
    if (comErr) throw new Error(`committee: ${comErr.message}`)
    inserted.committee = comData?.length ?? 0

    const decisions = [
      {
        title: `${DEMO_TAG} החלטה פתוחה — צביעת לובי`,
        body: 'הצעה לצביעת לובי הבניין בתקציב עד 15,000 ₪. נדרשות חתימות דיירים.',
        status: 'open',
        majority_threshold: 0.5,
        required_signatures: 8,
      },
      {
        title: `${DEMO_TAG} החלטה פתוחה — התקנת מצלמות`,
        body: 'הצעה להתקנת 4 מצלמות בלובי ובחניון. עלות משוערת 9,500 ₪.',
        status: 'open',
        majority_threshold: 0.5,
        required_signatures: 10,
      },
      {
        title: `${DEMO_TAG} החלטה פתוחה — שדרוג תאורה בחניה`,
        body: 'החלפת גופי תאורה ל־LED בחניון התת־קרקעי.',
        status: 'open',
        majority_threshold: 0.5,
        required_signatures: 6,
      },
      {
        title: `${DEMO_TAG} החלטה שעברה — חוזה ניקיון שנתי`,
        body: 'אושר חוזה ניקיון שנתי עם ספק DEMO ניקיון פלוס.',
        status: 'passed',
        majority_threshold: 0.5,
        required_signatures: 2,
        closed_at: new Date().toISOString(),
      },
      {
        title: `${DEMO_TAG} החלטה שעברה — ביטוח מבנה`,
        body: 'חודש ביטוח מבנה לשנה הנוכחית.',
        status: 'passed',
        majority_threshold: 0.5,
        required_signatures: 3,
        closed_at: new Date(Date.now() - 14 * 864e5).toISOString(),
      },
      {
        title: `${DEMO_TAG} טיוטת החלטה — שדרוג מעלית`,
        body: 'טיוטה בלבד: בדיקת הצעות מחיר לשדרוג מעלית — טרם פורסם לחתימה.',
        status: 'draft',
        majority_threshold: 0.667,
        required_signatures: 4,
      },
    ]

    const { data: decData, error: decErr } = await sb
      .from('building_decisions')
      .insert(
        decisions.map((d) => ({
          client_id: client.id,
          project_id: projectId,
          title: d.title,
          body: d.body,
          status: d.status,
          majority_threshold: d.majority_threshold,
          required_signatures: d.required_signatures,
          closed_at: d.closed_at ?? null,
        }))
      )
      .select('id, title, status')
    if (decErr) throw new Error(`decisions: ${decErr.message}`)
    inserted.decisions = decData?.length ?? 0

    const openDecs = (decData || []).filter((d) => d.status === 'open')
    const passedDecs = (decData || []).filter((d) => d.status === 'passed')
    const sigRows = []
    const recipientRows = []

    // Resident-facing pending signatures for first 8 residents on each open decision
    for (const [di, openDec] of openDecs.entries()) {
      const signerCount = Math.min(8, residentIds.length)
      for (let i = 0; i < signerCount; i++) {
        const res = resData[i]
        const token = `${IDEM_PREFIX}-sig-open-${di + 1}-r${i + 1}`
        // Preferred demo resident: pending on first two opens, signed on third if any
        let status = 'pending'
        if (i === 0 && di === 2) status = 'signed'
        if (i > 0 && i <= 2 && di === 0) status = 'signed' // some progress on first
        sigRows.push({
          client_id: client.id,
          project_id: projectId,
          decision_id: openDec.id,
          token,
          signer_name: res.full_name,
          signer_phone: res.phone,
          resident_id: res.id,
          status,
          signature_data_url: status === 'signed' ? 'data:image/png;base64,DEMO' : null,
          signed_at: status === 'signed' ? new Date().toISOString() : null,
          expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
        })
        recipientRows.push({
          client_id: client.id,
          project_id: projectId,
          decision_id: openDec.id,
          resident_id: res.id,
          channels: ['portal'],
          sms_status: 'skipped',
          email_status: 'skipped',
          portal_path: `${IDEM_PREFIX}/decisions/${openDec.id}`,
        })
      }
    }

    for (const [pi, passedDec] of passedDecs.entries()) {
      for (let i = 0; i < 3; i++) {
        const res = resData[i]
        if (!res) continue
        sigRows.push({
          client_id: client.id,
          project_id: projectId,
          decision_id: passedDec.id,
          token: `${IDEM_PREFIX}-sig-passed-${pi + 1}-r${i + 1}`,
          signer_name: res.full_name,
          signer_phone: res.phone,
          resident_id: res.id,
          status: 'signed',
          signature_data_url: 'data:image/png;base64,DEMO',
          signed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
        })
      }
    }

    if (sigRows.length) {
      const { data: sigData, error: sigErr } = await sb
        .from('building_signature_requests')
        .upsert(sigRows, { onConflict: 'token' })
        .select('id, token, decision_id, resident_id')
      if (sigErr) throw new Error(`signatures: ${sigErr.message}`)
      inserted.signatures = sigData?.length ?? 0

      const sigByKey = new Map(
        (sigData || []).map((s) => [`${s.decision_id}:${s.resident_id}`, s.id])
      )
      for (const rec of recipientRows) {
        rec.signature_request_id = sigByKey.get(`${rec.decision_id}:${rec.resident_id}`) ?? null
      }
      if (recipientRows.length) {
        const { data: recData, error: recErr } = await sb
          .from('building_decision_recipients')
          .upsert(recipientRows, { onConflict: 'decision_id,resident_id' })
          .select('id')
        if (recErr) throw new Error(`decision_recipients: ${recErr.message}`)
        inserted.decision_recipients = recData?.length ?? 0
      }
    }

    // Announcements
    const nowIso = new Date().toISOString()
    const annRows = ANNOUNCEMENTS.map((a, idx) => ({
      client_id: client.id,
      project_id: projectId,
      title: a.title,
      body: a.body,
      status: 'published',
      is_pinned: a.is_pinned,
      publish_at: new Date(Date.now() - (idx + 1) * 3600e3).toISOString(),
      published_at: new Date(Date.now() - (idx + 1) * 3600e3).toISOString(),
      expires_at: null,
    }))
    const { data: annData, error: annErr } = await sb
      .from('project_announcements')
      .insert(annRows)
      .select('id')
    if (annErr) throw new Error(`announcements: ${annErr.message}`)
    inserted.announcements = annData?.length ?? 0

    // Amenities + weekly hours
    let hoursCount = 0
    for (const am of AMENITIES) {
      const { data: amRow, error: amErr } = await sb
        .from('project_amenities')
        .insert({
          client_id: client.id,
          project_id: projectId,
          name: am.name,
          description: am.description,
          guidelines: am.guidelines,
          is_active: true,
          sort_order: am.sort_order,
        })
        .select('id')
        .single()
      if (amErr) throw new Error(`amenity ${am.name}: ${amErr.message}`)
      inserted.amenities += 1
      const hourRows = []
      for (let dow = 0; dow <= 6; dow++) {
        const closed = am.hours.closedDays.includes(dow)
        hourRows.push({
          amenity_id: amRow.id,
          day_of_week: dow,
          opens_at: closed ? null : am.hours.opens,
          closes_at: closed ? null : am.hours.closes,
          is_closed: closed,
        })
      }
      const { data: hData, error: hErr } = await sb
        .from('project_amenity_hours')
        .insert(hourRows)
        .select('id')
      if (hErr) throw new Error(`amenity hours: ${hErr.message}`)
      hoursCount += hData?.length ?? 0
    }
    inserted.amenity_hours = hoursCount

    // Collection charges for first 6 residents (incl. preferred demo) — portal published
    const chargeRows = []
    const chargeResidents = (resData || []).slice(0, 6)
    for (const [ri, res] of chargeResidents.entries()) {
      for (let m = 0; m < 3; m++) {
        const month = ((new Date().getMonth() + 12 - m) % 12) + 1
        const y = month > new Date().getMonth() + 1 ? YEAR - 1 : YEAR
        const period = `${y}-${String(month).padStart(2, '0')}`
        const isOpen = m === 0 || (m === 1 && ri % 2 === 0)
        const dueDay = String(Math.min(28, 5 + ri)).padStart(2, '0')
        chargeRows.push({
          client_id: client.id,
          project_id: projectId,
          resident_id: res.id,
          title: `${DEMO_TAG} ועד בית ${period}`,
          description: `חיוב חודשי דירה ${res.apartment_number} — דמו QA (ללא שליחה)`,
          amount: Number((380 + ri * 15 + m * 5).toFixed(2)),
          currency: 'ILS',
          status: isOpen ? 'sent' : 'paid',
          period_label: period,
          due_date: `${y}-${String(month).padStart(2, '0')}-${dueDay}`,
          sent_at: new Date(Date.now() - (m + 1) * 864e5 * 3).toISOString(),
          paid_at: isOpen ? null : new Date(Date.now() - m * 864e5 * 2).toISOString(),
          published_to_portal: true,
          public_token: randomUUID(),
          idempotency_key: `${IDEM_PREFIX}-chg-r${ri + 1}-m${m + 1}`,
        })
      }
    }
    // Unique index is (client_id, idempotency_key) partial — plain insert after wipe.
    const { data: chgData, error: chgErr } = await sb
      .from('collection_charges')
      .insert(chargeRows)
      .select('id')
    if (chgErr) throw new Error(`charges: ${chgErr.message}`)
    inserted.charges = chgData?.length ?? 0

    // Tickets for preferred demo resident (visible via resident_id match)
    if (demoResident) {
      const ticketSpecs = [
        { desc: `${DEMO_TAG} נזילה קלה בלובי ליד תיבות הדואר`, status: 'NEW', scope: 'common' },
        { desc: `${DEMO_TAG} תאורה שבורה בחניון קומה −1`, status: 'IN_PROGRESS', scope: 'common' },
        { desc: `${DEMO_TAG} רעש מעלית בשעות הלילה`, status: 'NEW', scope: 'common' },
        { desc: `${DEMO_TAG} בקשה לבדיקת מנעול דלת כניסה לדירה`, status: 'CLOSED', scope: 'private' },
        { desc: `${DEMO_TAG} ניקוי חדר אשפה — טופל`, status: 'CLOSED', scope: 'common' },
      ]
      const ticketRows = ticketSpecs.map((t, idx) => ({
        client_id: client.id,
        project_id: projectId,
        organization_id: organizationId,
        description: t.desc,
        status: t.status,
        scope: t.scope,
        source: 'portal',
        source_channel: 'portal',
        reporter_name: demoResident.full_name,
        reporter_phone: demoResident.phone,
        normalized_phone: RESIDENTS.find((r) => r.phone === demoResident.phone)?.norm || null,
        resident_id: demoResident.id,
        portal_idempotency_key: `${IDEM_PREFIX}-tkt-${String(idx + 1).padStart(2, '0')}`,
        opened_at: new Date(Date.now() - (idx + 1) * 864e5 * 2).toISOString(),
        closed_at: t.status === 'CLOSED' ? new Date(Date.now() - idx * 864e5).toISOString() : null,
        language: 'he',
        priority: 'MEDIUM',
      }))
      const { data: tktData, error: tktErr } = await sb.from('tickets').insert(ticketRows).select('id')
      if (tktErr) throw new Error(`tickets: ${tktErr.message}`)
      inserted.tickets = tktData?.length ?? 0
    }

    // Document metadata (list-only; storage object optional — signed URL may 404)
    const docRows = [
      {
        file_name: `${DEMO_TAG} תקנון בית משותף.pdf`,
        category: 'bylaws',
        notes: `${DEMO_TAG} מסמך QA — מטא־דאטה בלבד`,
      },
      {
        file_name: `${DEMO_TAG} פרוטוקול אסיפה אחרונה.pdf`,
        category: 'minutes',
        notes: `${DEMO_TAG} מסמך QA — מטא־דאטה בלבד`,
      },
      {
        file_name: `${DEMO_TAG} ביטוח מבנה ${YEAR}.pdf`,
        category: 'insurance',
        notes: `${DEMO_TAG} מסמך QA — מטא־דאטה בלבד`,
      },
      {
        file_name: `${DEMO_TAG} הצעת מחיר מעליות.pdf`,
        category: 'quotes',
        notes: `${DEMO_TAG} מסמך QA — מטא־דאטה בלבד`,
      },
      {
        file_name: `${DEMO_TAG} מפת חירום ולובי.pdf`,
        category: 'safety',
        notes: `${DEMO_TAG} מסמך QA — מטא־דאטה בלבד`,
      },
    ].map((d, idx) => ({
      client_id: client.id,
      project_id: projectId,
      file_name: d.file_name,
      storage_path: `${client.id}/${projectId}/${IDEM_PREFIX}-doc-${idx + 1}.pdf`,
      mime_type: 'application/pdf',
      file_size: 12000 + idx * 1500,
      notes: d.notes,
      category: d.category,
      visibility: 'residents',
      published_at: nowIso,
      building_id: null,
    }))
    const { data: docData, error: docErr } = await sb.from('project_documents').insert(docRows).select('id')
    if (docErr) throw new Error(`documents: ${docErr.message}`)
    inserted.documents = docData?.length ?? 0
  } else if (dryRun) {
    inserted.expenses = 48
    inserted.budgets = 6
    inserted.residents = RESIDENTS.length
    inserted.committee = COMMITTEE.length
    inserted.decisions = 6
    inserted.signatures = 30
    inserted.decision_recipients = 24
    inserted.announcements = ANNOUNCEMENTS.length
    inserted.amenities = AMENITIES.length
    inserted.amenity_hours = AMENITIES.length * 7
    inserted.charges = 18
    inserted.tickets = 5
    inserted.documents = 5
  }

  // Verify project is on target client
  let verify = null
  if (projectId && !dryRun) {
    const { data: v } = await sb
      .from('projects')
      .select('id, name, project_code, client_id, is_active, resident_portal_enabled')
      .eq('id', projectId)
      .maybeSingle()
    verify = v
  }

  const summary = {
    ok: true,
    dry_run: dryRun,
    client_id: client.id,
    client_name: client.name,
    project_id: projectId,
    project_code: DEMO_PROJECT_CODE,
    project_name: DEMO_PROJECT_NAME,
    project_on_client: verify?.client_id === client.id,
    year: YEAR,
    wiped: wipeCounts,
    inserted,
    demo_resident: {
      name: RESIDENTS[0].name,
      phone: PREFERRED_DEMO_PHONE,
      apartment: '1',
    },
    qa: {
      manager_projects: 'Login as סביון manager → http://localhost:3000/projects → open [DEMO] בניין QA Hub',
      resident_demo: 'http://localhost:3000/resident/demo (RESIDENT_PORTAL_DEV_UNLOCK=true)',
      resident_join: `http://localhost:3000/resident/join/${projectId}`,
      notes: 'All demo rows tagged [DEMO] / DEMO_* / demo-hub-qa-* ; no notify sent',
    },
  }
  console.log('\n=== SUMMARY ===')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
