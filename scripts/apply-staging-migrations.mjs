#!/usr/bin/env node
/**
 * Apply supabase/migrations/*.sql in order to a Staging Supabase project via
 * the Management SQL API is not available here — use `supabase db push` with
 * a linked staging project, or the MCP apply_migration / execute_sql tools.
 *
 * This helper prints the ordered file list and refuses production ref.
 *
 * Usage:
 *   node scripts/apply-staging-migrations.mjs
 *   STAGING_PROJECT_REF=xxxx npx supabase link --project-ref $STAGING_PROJECT_REF
 *   npx supabase db push
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'supabase', 'migrations')
const PROD_REF = 'jsliqlmjksintyigkulq'

const ref = (process.env.STAGING_PROJECT_REF || '').trim()
if (ref && ref === PROD_REF) {
  console.error('REFUSING production Bamakor ref')
  process.exit(2)
}

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

console.log(`Migrations to apply (${files.length}):`)
for (const f of files) console.log(`  ${f}`)
console.log(`
Next:
  1. Create / obtain bino-staging project (NOT ${PROD_REF})
  2. STAGING_PROJECT_REF=<ref> npx supabase link --project-ref <ref>
  3. npx supabase db push
  4. node scripts/seed-staging-demo.mjs
`)
