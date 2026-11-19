#!/usr/bin/env node
/**
 * Seed isolated Staging demo = Savion sales-demo account shape.
 *
 * Mirrors production Savion demo (NOT a copy of live rows):
 *   client  07773bb3-4969-4bce-8ce2-faab3b26383c  name סביון
 *   org     a281af3c-99b6-4a4a-a5ba-9498e05e984e
 *   login   savion@bino.com / Savion2026!
 *
 * Refuses Bamakor production cloud host.
 *
 * Usage:
 *   npm run seed:staging
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const PROD_REF = 'jsliqlmjksintyigkulq'

/** Same IDs as production Savion / OpsBrain demo tenant */
const SAVION_CLIENT_ID = '07773bb3-4969-4bce-8ce2-faab3b26383c'
const SAVION_ORG_ID = 'a281af3c-99b6-4a4a-a5ba-9498e05e984e'
const SAVION_ORG_SLUG = 'savion-staging'

const DEMO_EMAIL = (process.env.STAGING_LOGIN_EMAIL || process.env.DEMO_LOGIN_EMAIL || 'savion@bino.com')
  .trim()
  .toLowerCase()
const DEMO_PASSWORD =
  process.env.STAGING_LOGIN_PASSWORD || process.env.DEMO_LOGIN_PASSWORD || 'Savion2026!'

const CLIENT_NAME = 'סביון'
const COMPANY_NAME = "חיים בג'איו"
const PROJECT_CODE = 'SAVION_DEMO'
const PROJECT_NAME = 'סביון — בניין דמו'

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
  if (host === `${PROD_REF}.supabase.co`) {
    console.error('REFUSING: Bamakor production cloud. Use local staging Supabase only.')
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
    console.error('Password must be at least 8 characters')
    process.exit(1)
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Client — fixed Savion UUID
  {
    const { data: existing } = await admin
      .from('clients')
      .select('id')
      .eq('id', SAVION_CLIENT_ID)
      .limit(1)
    if (existing?.[0]?.id) {
      const { error } = await admin
        .from('clients')
        .update({
          name: CLIENT_NAME,
          company_name: COMPANY_NAME,
          email_slug: 'savion',
          is_active: true,
        })
        .eq('id', SAVION_CLIENT_ID)
      if (error) throw new Error(`clients update: ${error.message}`)
      console.log('client updated', SAVION_CLIENT_ID)
    } else {
      const { error } = await admin.from('clients').insert({
        id: SAVION_CLIENT_ID,
        name: CLIENT_NAME,
        company_name: COMPANY_NAME,
        email_slug: 'savion',
        is_active: true,
      })
      if (error) throw new Error(`clients insert: ${error.message}`)
      console.log('client created', SAVION_CLIENT_ID)
    }
  }

  // Organization — fixed Savion UUID
  {
    const { data: existing } = await admin
      .from('organizations')
      .select('id')
      .eq('id', SAVION_ORG_ID)
      .limit(1)
    if (existing?.[0]?.id) {
      const { error } = await admin
        .from('organizations')
        .update({
          name: COMPANY_NAME,
          slug: SAVION_ORG_SLUG,
          client_id: SAVION_CLIENT_ID,
          is_active: true,
        })
        .eq('id', SAVION_ORG_ID)
      if (error) throw new Error(`organizations update: ${error.message}`)
    } else {
      // Drop conflicting slug if leftover from prior staging seed
      await admin.from('organizations').delete().eq('slug', SAVION_ORG_SLUG)
      const { error } = await admin.from('organizations').insert({
        id: SAVION_ORG_ID,
        name: COMPANY_NAME,
        slug: SAVION_ORG_SLUG,
        plan: 'pro',
        client_id: SAVION_CLIENT_ID,
        is_active: true,
      })
      if (error) throw new Error(`organizations insert: ${error.message}`)
    }
    console.log('organization', SAVION_ORG_ID)
  }

  let projectId
  {
    const { data: existing } = await admin
      .from('projects')
      .select('id')
      .eq('client_id', SAVION_CLIENT_ID)
      .eq('project_code', PROJECT_CODE)
      .limit(1)
    if (existing?.[0]?.id) {
      projectId = existing[0].id
    } else {
      projectId = randomUUID()
      const { error } = await admin.from('projects').insert({
        id: projectId,
        client_id: SAVION_CLIENT_ID,
        organization_id: SAVION_ORG_ID,
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
      .eq('client_id', SAVION_CLIENT_ID)
      .eq('project_id', projectId)
      .eq('phone', phone)
      .limit(1)
    if (hit?.[0]?.id) continue
    const { error } = await admin.from('residents').insert({
      client_id: SAVION_CLIENT_ID,
      project_id: projectId,
      full_name: `דייר סביון ${i}`,
      phone,
      apartment_number: String(i),
      notes: '[STAGING][SAVION]',
    })
    if (error && !/duplicate|unique/i.test(error.message)) {
      console.warn('resident insert skip:', error.message)
    }
  }

  {
    const { data: existing } = await admin
      .from('tickets')
      .select('id')
      .eq('client_id', SAVION_CLIENT_ID)
      .eq('project_id', projectId)
      .limit(1)
    if (!existing?.[0]?.id) {
      const { error } = await admin.from('tickets').insert({
        client_id: SAVION_CLIENT_ID,
        project_id: projectId,
        ticket_number: 1,
        status: 'NEW',
        priority: 'MEDIUM',
        description: '[STAGING] תקלת דמו סביון — מעלית תקועה',
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
      user_metadata: {
        staging: true,
        savion_demo: true,
        client_id: SAVION_CLIENT_ID,
        organization_id: SAVION_ORG_ID,
      },
    })
    if (error) throw new Error(`createUser: ${error.message}`)
    userId = created.user.id
    console.log('auth user created', userId)
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        staging: true,
        savion_demo: true,
        client_id: SAVION_CLIENT_ID,
        organization_id: SAVION_ORG_ID,
      },
    })
    if (error) throw new Error(`updateUser: ${error.message}`)
    console.log('auth user updated', userId)
  }

  // Single-tenant: only Savion org
  await admin.from('organization_users').delete().eq('user_id', userId).neq('organization_id', SAVION_ORG_ID)
  const { error: upsertErr } = await admin.from('organization_users').upsert(
    { organization_id: SAVION_ORG_ID, user_id: userId, role: 'admin' },
    { onConflict: 'organization_id,user_id' }
  )
  if (upsertErr) throw new Error(`organization_users: ${upsertErr.message}`)

  // Drop leftover staging-admin user from earlier seed (best-effort)
  const legacy = await findUserIdByEmail(admin, 'staging-admin@bino.casa')
  if (legacy && legacy !== userId) {
    await admin.from('organization_users').delete().eq('user_id', legacy)
    await admin.auth.admin.deleteUser(legacy)
    console.log('removed legacy staging-admin@bino.casa')
  }

  console.log('\nStaging ≈ Savion demo OK')
  console.log('  API:     ', url)
  console.log('  Email:   ', DEMO_EMAIL)
  console.log('  Password:', DEMO_PASSWORD)
  console.log('  Client:  ', SAVION_CLIENT_ID, `(${CLIENT_NAME})`)
  console.log('  Org:     ', SAVION_ORG_ID)
  console.log('  Project: ', projectId)
  console.log('\nLocal QA: npm run dev:lan → login like production Savion demo')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
