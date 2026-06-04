/**
 * INTEGRATION TESTS ג€” Live Supabase connectivity & schema alignment
 *
 * Uses PostgREST-compatible introspection (no information_schema via .from()).
 * Table existence  ג†’ SELECT id LIMIT 0; error = doesn't exist
 * Column existence ג†’ SELECT col LIMIT 0; code 42703 = column missing
 * RLS/policies     ג†’ tested indirectly via anon-scoped queries
 *
 * Run: npx vitest run tests/integration/supabase-schema.integration.test.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { TICKET_STATUSES } from '@/lib/ticket-status'
import * as path from 'path'
import * as fs from 'fs'

// ג”€ג”€ג”€ Load .env.local manually ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

// ג”€ג”€ג”€ Clients ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
let admin: SupabaseClient
let anonClient: SupabaseClient

beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  admin = createClient(url, serviceKey)
  if (anonKey) anonClient = createClient(url, anonKey)
})

// ג”€ג”€ג”€ Helpers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
/** Returns true if table is reachable (exists & no error besides RLS). */
async function tableExists(table: string): Promise<boolean> {
  const { error } = await admin.from(table).select('*').limit(0)
  if (!error) return true
  // PGRST200 = table/view not found in schema cache
  return error.code !== 'PGRST200' && error.code !== 'PGRST204'
}

/** Returns true if column exists; false on error code 42703. */
async function columnExists(table: string, col: string): Promise<boolean> {
  const { error } = await admin.from(table).select(col).limit(0)
  if (!error) return true
  if (error.code === '42703') return false   // column does not exist
  if (error.code === 'PGRST200') return false // table not found
  // any other error ג†’ column probably exists (RLS, etc.)
  return true
}

// ג”€ג”€ג”€ 1. Basic connectivity ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('1. Basic connectivity', () => {
  it('connects to Supabase with service role', async () => {
    const { data, error } = await admin.from('clients').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})

// ג”€ג”€ג”€ 2. Table existence ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('2. Table existence', () => {
  const expectedTables = [
    'clients', 'projects', 'tickets', 'workers', 'sessions', 'residents',
    'ticket_logs', 'ticket_attachments', 'organizations', 'organization_users',
    'pending_resident_join_requests', 'error_logs', 'ticket_internal_messages',
    'whatsapp_templates', 'audit_log', 'billing_events', 'push_subscriptions',
    'processed_webhooks', 'failed_notifications', 'api_rate_limit',
    'worker_nfc_tags', 'worker_attendance_events', 'worker_attendance',
  ]

  for (const table of expectedTables) {
    it(`"${table}" is reachable`, async () => {
      const exists = await tableExists(table)
      if (!exists) console.warn(`ג ן¸  Table "${table}" NOT FOUND in schema cache ג€” migration may be missing`)
      expect(exists).toBe(true)
    })
  }
})

// ג”€ג”€ג”€ 3. Critical columns ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('3. Critical columns', () => {
  const checks: Array<[string, string[]]> = [
    ['clients',           ['id', 'name', 'plan_tier', 'max_workers', 'whatsapp_phone_number_id', 'buildings_allowed']],
    ['organizations',     ['id', 'name', 'slug', 'client_id', 'is_active', 'created_at']],
    ['organization_users',['id', 'organization_id', 'user_id', 'role', 'created_at']],
    ['projects',          ['id', 'client_id', 'name', 'project_code', 'organization_id', 'assigned_worker_id', 'is_active']],
    ['tickets',           ['id', 'client_id', 'ticket_number', 'status', 'priority', 'description',
                           'deleted_at', 'merged_into_ticket_id', 'ticket_metadata',
                           'project_id', 'reporter_phone', 'reporter_name',
                           'assigned_worker_id', 'building_number', 'closed_at']],
    ['workers',           ['id', 'client_id', 'full_name', 'phone', 'extra_phones', 'is_active', 'deleted_at', 'access_token', 'email', 'role']],
    ['residents',         ['id', 'client_id', 'phone', 'deleted_at']],
    ['sessions',          ['id', 'client_id', 'phone', 'pending_location']],
    ['ticket_attachments',['id', 'ticket_id', 'file_name', 'file_url', 'mime_type', 'attachment_type', 'whatsapp_media_id']],
    ['audit_log',         ['id', 'client_id', 'user_id', 'action', 'entity_type', 'entity_id', 'old_values', 'new_values']],
    ['push_subscriptions',['user_id', 'client_id', 'subscription']],
    ['whatsapp_templates',['id', 'client_id', 'template_key', 'template_text']],
    ['failed_notifications',['id', 'client_id', 'channel', 'error_message']],
    ['processed_webhooks',['message_id', 'client_id']],
    ['worker_nfc_tags', ['id', 'client_id', 'tag_code', 'tag_type', 'is_active']],
    ['worker_attendance_events', ['id', 'client_id', 'worker_id', 'client_action_id', 'event_type', 'sync_status']],
    ['worker_attendance', ['id', 'client_id', 'worker_id', 'started_at', 'status']],
  ]

  for (const [table, cols] of checks) {
    for (const col of cols) {
      it(`${table}.${col} exists`, async () => {
        const exists = await columnExists(table, col)
        if (!exists) console.error(`נ¨  MISSING COLUMN: ${table}.${col} ג€” migration not applied!`)
        expect(exists).toBe(true)
      })
    }
  }
})

// ג”€ג”€ג”€ 4. Tenant resolution chain ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('4. Tenant resolution chain', () => {
  it('organizations has row with non-null client_id', async () => {
    const { data, error } = await admin
      .from('organizations').select('id, client_id').not('client_id', 'is', null).limit(1)
    expect(error).toBeNull()
    expect((data as unknown[]).length).toBeGreaterThan(0)
  })

  it('organization_users ג†’ organizations ג†’ clients resolves end-to-end', async () => {
    const { data: ouData } = await admin
      .from('organization_users').select('organization_id, user_id').limit(1)
    if (!ouData?.length) { console.warn('No organization_users rows'); return }
    const ou = (ouData as Array<{organization_id:string; user_id:string}>)[0]

    const { data: orgData, error: orgErr } = await admin
      .from('organizations').select('id, client_id').eq('id', ou.organization_id).maybeSingle()
    expect(orgErr).toBeNull()
    const org = orgData as {id:string; client_id:string|null}
    expect(org?.client_id).toBeTruthy()

    const { data: clientData, error: clientErr } = await admin
      .from('clients').select('id, name').eq('id', org.client_id!).maybeSingle()
    expect(clientErr).toBeNull()
    expect(clientData).not.toBeNull()
    const client = clientData as {id:string; name:string}
    console.log(`ג“ user ${ou.user_id} ג†’ org ${org.id} ג†’ client "${client.name}"`)
  })
})

// ג”€ג”€ג”€ 5. Cross-tenant isolation ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('5. Cross-tenant isolation', () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const tables = ['tickets', 'workers', 'projects', 'residents']
  for (const table of tables) {
    it(`${table} with fake client_id returns 0 rows`, async () => {
      const { data, error } = await admin.from(table).select('id').eq('client_id', fakeId).limit(5)
      expect(error).toBeNull()
      expect((data as unknown[]).length).toBe(0)
    })
  }
})

// ג”€ג”€ג”€ 6. Soft delete filter works ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('6. Soft delete', () => {
  const tables = ['tickets', 'workers', 'residents']
  for (const table of tables) {
    it(`${table}: active count ג‰₪ total count (deleted_at filter)`, async () => {
      const { count: total } = await admin.from(table).select('*', { count: 'exact', head: true })
      const { count: active, error } = await admin
        .from(table).select('*', { count: 'exact', head: true }).is('deleted_at', null)
      if (error?.code === '42703') {
        console.error(`נ¨  deleted_at missing on ${table}!`)
        throw error
      }
      expect(active ?? 0).toBeLessThanOrEqual(total ?? 0)
    })
  }
})

// ג”€ג”€ג”€ 7. Ticket domain values ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('7. Ticket domain values', () => {
  it('all statuses are within valid domain', async () => {
    const valid = new Set<string>([...TICKET_STATUSES])
    const { data, error } = await admin.from('tickets').select('status').limit(500)
    expect(error).toBeNull()
    const invalid = [...new Set((data as Array<{status:string}>).map(r=>r.status).filter(s=>!valid.has(s)))]
    if (invalid.length) console.error('נ¨  Unknown ticket statuses:', invalid)
    expect(invalid.length).toBe(0)
  })

  it('all priorities are within valid domain', async () => {
    const valid = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
    const { data, error } = await admin.from('tickets').select('priority').limit(500)
    expect(error).toBeNull()
    const invalid = [...new Set(
      (data as Array<{priority:string|null}>).map(r=>r.priority).filter(p=>p !== null && !valid.has(p!))
    )]
    if (invalid.length) console.error('נ¨  Unknown ticket priorities:', invalid)
    expect(invalid.length).toBe(0)
  })
})

// ג”€ג”€ג”€ 8. Plan limits readable ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('8. Plan limits', () => {
  it('clients.plan_tier and max_workers selectable', async () => {
    const { data, error } = await admin
      .from('clients').select('id, plan_tier, max_workers, buildings_allowed').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})

// ג”€ג”€ג”€ 9. withClientId scoping ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('9. withClientId scoping against real client', () => {
  it('tickets scoped by real client_id return no error', async () => {
    const { data: clientData } = await admin.from('clients').select('id').limit(1)
    if (!clientData?.length) { console.warn('No clients'); return }
    const clientId = (clientData as Array<{id:string}>)[0].id
    const { data, error } = await admin
      .from('tickets').select('id, ticket_number, status')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }).limit(10)
    expect(error).toBeNull()
    console.log(`ג“ ${(data as unknown[]).length} tickets for client ${clientId}`)
  })
})

// ג”€ג”€ג”€ 10. Referential integrity ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('10. Referential integrity', () => {
  it('no tickets reference non-existent project_id', async () => {
    const { data: tickets } = await admin
      .from('tickets').select('project_id').not('project_id','is',null).is('deleted_at',null).limit(100)
    if (!tickets?.length) return
    const projectIds = [...new Set((tickets as Array<{project_id:string}>).map(t=>t.project_id))]
    const { data: projects } = await admin.from('projects').select('id').in('id', projectIds)
    const found = new Set((projects as Array<{id:string}>).map(p=>p.id))
    const orphans = projectIds.filter(id=>!found.has(id))
    if (orphans.length) console.error('נ¨  Orphan project_ids on tickets:', orphans)
    expect(orphans.length).toBe(0)
  })

  it('no workers reference non-existent client_id', async () => {
    const { data: workers } = await admin
      .from('workers').select('client_id').is('deleted_at', null).limit(100)
    if (!workers?.length) return
    const cids = [...new Set((workers as Array<{client_id:string}>).map(w=>w.client_id))]
    const { data: clients } = await admin.from('clients').select('id').in('id', cids)
    const found = new Set((clients as Array<{id:string}>).map(c=>c.id))
    const orphans = cids.filter(id=>!found.has(id))
    if (orphans.length) console.error('נ¨  Workers with orphan client_id:', orphans)
    expect(orphans.length).toBe(0)
  })
})

// ג”€ג”€ג”€ 11. RLS ג€” anon blocked from tenant data ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
describe('11. RLS ג€” anon client blocked from tenant data', () => {
  it('anon cannot read tickets (no auth)', async () => {
    if (!anonClient) { console.warn('No NEXT_PUBLIC_SUPABASE_ANON_KEY ג€” skipping'); return }
    const { data, error } = await anonClient.from('tickets').select('id').limit(5)
    // Either error or empty ג€” should never return real rows unauthenticated
    const rowCount = (data as unknown[] | null)?.length ?? 0
    if (rowCount > 0) console.error('נ¨  RLS BREACH: anon client read tickets without auth!')
    expect(rowCount).toBe(0)
  })

  it('anon cannot read workers (no auth)', async () => {
    if (!anonClient) { console.warn('No NEXT_PUBLIC_SUPABASE_ANON_KEY ג€” skipping'); return }
    const { data } = await anonClient.from('workers').select('id').limit(5)
    const rowCount = (data as unknown[] | null)?.length ?? 0
    if (rowCount > 0) console.error('נ¨  RLS BREACH: anon client read workers without auth!')
    expect(rowCount).toBe(0)
  })
})

