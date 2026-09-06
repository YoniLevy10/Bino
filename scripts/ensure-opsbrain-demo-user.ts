#!/usr/bin/env npx tsx
/**
 * Ensure a password login for the OpsBrain sales-demo tenant.
 *
 * Default (override with env):
 *   DEMO_LOGIN_EMAIL=savion@bamakor.com
 *   DEMO_LOGIN_PASSWORD=savion2026!
 *   OPSBRAIN_CLIENT_ID=07773bb3-4969-4bce-8ce2-faab3b26383c
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   npx tsx scripts/ensure-opsbrain-demo-user.ts
 *
 * For each new prospect: re-skin OpsBrain via seed SQL, then re-run this script
 * (or change DEMO_LOGIN_* for a dedicated prospect mailbox).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const OPSBRAIN_CLIENT_ID =
  process.env.OPSBRAIN_CLIENT_ID?.trim() || '07773bb3-4969-4bce-8ce2-faab3b26383c'
const DEMO_EMAIL = (process.env.DEMO_LOGIN_EMAIL || 'savion@bamakor.com').trim().toLowerCase()
const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || 'savion2026!'
const DEMO_ROLE = (process.env.DEMO_LOGIN_ROLE as 'admin' | 'manager' | 'viewer') || 'admin'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
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

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  // listUsers is paginated; demo mailbox should appear early, but scan a few pages.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const hit = data.users.find((u) => u.email?.trim().toLowerCase() === email)
    if (hit?.id) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (DEMO_PASSWORD.length < 8) {
    console.error('DEMO_LOGIN_PASSWORD must be at least 8 characters')
    process.exit(1)
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('id, name, client_id')
    .eq('client_id', OPSBRAIN_CLIENT_ID)
    .limit(1)

  if (orgErr) throw new Error(orgErr.message)
  if (!orgRows?.length) {
    console.error(`No organization for OpsBrain client ${OPSBRAIN_CLIENT_ID}`)
    process.exit(1)
  }
  const org = orgRows[0]

  let userId = await findUserIdByEmail(admin, DEMO_EMAIL)

  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        demo: true,
        client_id: OPSBRAIN_CLIENT_ID,
        organization_id: org.id,
      },
    })
    if (createErr || !created.user?.id) {
      console.error('createUser failed:', createErr?.message || 'no user id')
      process.exit(1)
    }
    userId = created.user.id
    console.log(`Created auth user ${DEMO_EMAIL} (${userId})`)
  } else {
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: {
        demo: true,
        client_id: OPSBRAIN_CLIENT_ID,
        organization_id: org.id,
      },
    })
    if (updateErr) {
      console.error('updateUserById failed:', updateErr.message)
      process.exit(1)
    }
    console.log(`Updated password for existing user ${DEMO_EMAIL} (${userId})`)
  }

  // Keep this mailbox single-tenant: drop other org memberships.
  const { data: existingMemberships, error: listOuErr } = await admin
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)

  if (listOuErr) throw new Error(listOuErr.message)

  const foreign = (existingMemberships ?? []).filter((row) => row.organization_id !== org.id)
  if (foreign.length) {
    const { error: delErr } = await admin
      .from('organization_users')
      .delete()
      .eq('user_id', userId)
      .neq('organization_id', org.id)
    if (delErr) throw new Error(delErr.message)
    console.log(`Removed ${foreign.length} non-OpsBrain organization_users row(s)`)
  }

  const { error: upsertErr } = await admin.from('organization_users').upsert(
    { organization_id: org.id, user_id: userId, role: DEMO_ROLE },
    { onConflict: 'organization_id,user_id' }
  )
  if (upsertErr) throw new Error(upsertErr.message)

  console.log('Linked to OpsBrain organization:', org.name, org.id)
  console.log('')
  console.log('Demo login ready:')
  console.log(`  email:    ${DEMO_EMAIL}`)
  console.log(`  password: ${DEMO_PASSWORD}`)
  console.log(`  client:   ${OPSBRAIN_CLIENT_ID}`)
  console.log('')
  console.log('Open /login and sign in with email + password.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
