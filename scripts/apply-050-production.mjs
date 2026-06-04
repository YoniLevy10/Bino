/**
 * Apply 050_paid_addons_full_catalog.sql to production (reads .env.migrate.tmp).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env.migrate.tmp')

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  let val = t.slice(eq + 1).trim()
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  process.env[t.slice(0, eq).trim()] = val
}

const dbUrl =
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  null

if (!dbUrl || dbUrl.length < 30) {
  console.error('Missing POSTGRES_URL in .env.migrate.tmp — run: vercel env pull .env.migrate.tmp --environment=production')
  process.exit(1)
}

const sqlPath = path.join(root, 'supabase', 'migrations', '050_paid_addons_full_catalog.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

const { default: pg } = await import('pg')
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
console.log('Connected — applying 050_paid_addons_full_catalog.sql ...')
try {
  await client.query(sql)
  console.log('OK: 050 applied')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (
    msg.includes('already exists') ||
    msg.includes('duplicate key') ||
    msg.includes('duplicate_object')
  ) {
    console.log('Already applied (idempotent):', msg.slice(0, 120))
  } else {
    console.error('FAILED:', msg)
    process.exit(1)
  }
} finally {
  await client.end()
}
