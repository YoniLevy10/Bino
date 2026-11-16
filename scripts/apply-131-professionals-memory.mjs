#!/usr/bin/env node
/**
 * Apply supabase/migrations/131_professionals_operational_memory.sql
 * Requires POSTGRES_URL / DATABASE_URL / SUPABASE_DB_PASSWORD+POSTGRES_HOST in env.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { config } from 'dotenv'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: join(root, '.env.local') })

function resolveUrl() {
  const direct =
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim()
  if (direct) return direct.replace(/[?&]sslmode=[^&]+/gi, '')
  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  const host = process.env.POSTGRES_HOST?.trim() || 'db.jsliqlmjksintyigkulq.supabase.co'
  if (password) {
    const user = process.env.POSTGRES_USER?.trim() || 'postgres'
    const db = process.env.POSTGRES_DATABASE?.trim() || 'postgres'
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${db}`
  }
  return null
}

const sqlPath = join(root, 'supabase/migrations/131_professionals_operational_memory.sql')
if (!existsSync(sqlPath)) {
  console.error('Missing', sqlPath)
  process.exit(1)
}

const url = resolveUrl()
if (!url) {
  console.error(
    'No Postgres URL. Set DATABASE_URL or SUPABASE_DB_PASSWORD, or run the SQL in Supabase SQL Editor.'
  )
  process.exit(2)
}

const sql = readFileSync(sqlPath, 'utf8')
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query(sql)
  console.log('OK: applied 131_professionals_operational_memory.sql')
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  if (/already exists/i.test(msg)) {
    console.log('OK: already applied (', msg.slice(0, 80), ')')
  } else {
    console.error('FAIL:', msg)
    process.exit(1)
  }
} finally {
  await client.end()
}
