#!/usr/bin/env node
/**
 * Seed isolated Staging demo tenant + manager password user.
 *
 * Safe by design: refuses Bamakor production project ref (jsliqlmjksintyigkulq).
 * Intended for local Supabase (`supabase start`) or a dedicated free staging project.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=… \
 *   node scripts/seed-staging-demo.mjs
 *
 * Or with .env.staging.local / .env.local pointed at local staging.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PROD_REF = 'jsliqlmjksintyigkulq'
const DEMO_EMAIL = (process.env.STAGING_LOGIN_EMAIL || 'staging-admin@bino.casa').trim().toLowerCase()
const DEMO_PASSWORD = process.env.STAGING_LOGIN_PASSWORD || 'BinoStaging2026!'
const CLIENT_NAME = '[STAGING] חברת ניהול דמו'
const ORG_SLUG = 'staging-demo'
const PROJECT_CODE = 'STAGING_DEMO'
const PROJECT_NAME = '[STAGING] בניין דמו'

function loadEnvFile(name) {
  const envPath = path.join(ROOT, name)
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) process.env[key] = val
  }
}

function assertNotProduction(url) {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    host = url
  }
  // Local docker containers may be named after a linked ref — only refuse cloud prod host.
  if (host === `${PROD_REF}.supabase.co`) {
    console.error('REFUSING: URL points at Bamakor production Supabase cloud. Use local or bino-staging only.')
    process.exit(2)
  }
}

async function findUserIdByEmail(admin, email) {
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.trim().toLowerCase() === email)
    if (hit?.id) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  // Prefer staging env file so we never accidentally seed .env.local prod leftovers.
  loadEnvFile('.env.staging.local')
  loadEnvFile('.env.local')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  assertNotProduction(url)
  if (DEMO_PASSWORD.length < 8) {
    console.error('STAGING_LOGIN_PASSWORD must be at least 8 characters')
    process.exit(1)
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let clientId
  {
    const { data: existing, error } = await admin
      .from('clients')
      .select('id, name')
      .ilike('name', '%STAGING%')
      .limit(1)
    if (error) throw new Error(`clients select: ${error.message}`)
    if (existing?.[0]?.id) {
      clientId = existing[0].id
      console.log('client exists', clientId)
    } else {
      clientId = randomUUID()
      const { error: insErr } = await admin.from('clients').insert({
        id: clientId,
        name: CLIENT_NAME,
        is_active: true,
      })
      if (insErr) throw new Error(`clients insert: ${insErr.message}`)
      console.log('client created', clientId)
    }
  }

  let orgId
  {
    const { data: byClient } = await admin
      .from('organizations')
      .select('id')
      .eq('client_id', clientId)
      .limit(1)
    if (byClient?.[0]?.id) {
      orgId = byClient[0].id
    } else {
      const { data: bySlug } = await admin
        .from('organizations')
        .select('id')
        .eq('slug', ORG_SLUG)
        .limit(1)
      if (bySlug?.[0]?.id) {
        orgId = bySlug[0].id
        await admin.from('organizations').update({ client_id: clientId, name: CLIENT_NAME }).eq('id', orgId)
      } else {
        orgId = randomUUID()
        const { error } = await admin.from('organizations').insert({
          id: orgId,
          name: CLIENT_NAME,
          slug: ORG_SLUG,
          plan: 'basic',
          client_id: clientId,
          is_active: true,
        })
        if (error) throw new Error(`organizations insert: ${error.message}`)
      }
    }
    console.log('organization', orgId)
  }

  let projectId
  {
    const { data: existing } = await admin
      .from('projects')
      .select('id')
      .eq('client_id', clientId)
      .eq('project_code', PROJECT_CODE)
      .limit(1)
    if (existing?.[0]?.id) {
      projectId = existing[0].id
    } else {
      projectId = randomUUID()
      const { error } = await admin.from('projects').insert({
        id: projectId,
        client_id: clientId,
        name: PROJECT_NAME,
        project_code: PROJECT_CODE,
        is_active: true,
      })
      if (error) throw new Error(`projects insert: ${error.message}`)
    }
    console.log('project', projectId)
  }

  for (let i = 1; i <= 3; i++) {
    const phone = `050000010${i}`
    const { data: hit } = await admin
      .from('residents')
      .select('id')
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .eq('phone', phone)
      .limit(1)
    if (hit?.[0]?.id) continue
    const { error } = await admin.from('residents').insert({
      client_id: clientId,
      project_id: projectId,
      full_name: `דייר דמו ${i}`,
      phone,
      apartment_number: String(i),
      notes: '[STAGING]',
    })
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.warn('resident insert skip:', error.message)
    }
  }

  // Open demo ticket
  {
    const { data: existing } = await admin
      .from('tickets')
      .select('id')
      .eq('client_id', clientId)
      .eq('project_id', projectId)
      .limit(1)
    if (!existing?.[0]?.id) {
      const { error } = await admin.from('tickets').insert({
        client_id: clientId,
        project_id: projectId,
        ticket_number: 1,
        status: 'NEW',
        priority: 'MEDIUM',
        description: '[STAGING] תקלת דמו — מעלית תקועה',
      })
      if (error) console.warn('ticket insert skip:', error.message)
    }
  }

  let userId = await findUserIdByEmail(admin, DEMO_EMAIL)
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { staging: true, client_id: clientId, organization_id: orgId },
    })
    if (error) throw new Error(`createUser: ${error.message}`)
    userId = created.user.id
    console.log('auth user created', userId)
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    })
    if (error) throw new Error(`updateUser: ${error.message}`)
    console.log('auth user updated', userId)
  }

  const { error: upsertErr } = await admin.from('organization_users').upsert(
    { organization_id: orgId, user_id: userId, role: 'admin' },
    { onConflict: 'organization_id,user_id' }
  )
  if (upsertErr) throw new Error(`organization_users: ${upsertErr.message}`)

  console.log('\nStaging seed OK')
  console.log('  API:    ', url)
  console.log('  Email:  ', DEMO_EMAIL)
  console.log('  Password:', DEMO_PASSWORD)
  console.log('  Client: ', clientId)
  console.log('  Project:', projectId)
  console.log('\nLocal QA: npm run dev:lan  → open from iPhone on same Wi‑Fi')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
