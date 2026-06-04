/**
 * Apply professionals + paid addons migrations (045, 046, 047).
 *
 * Requires one of:
 *   POSTGRES_URL_NON_POOLING
 *   POSTGRES_URL
 *   DATABASE_URL
 *   SUPABASE_DB_URL
 * Or build from SUPABASE_DB_PASSWORD + host in .env.local:
 *   postgresql://postgres:[password]@db.jsliqlmjksintyigkulq.supabase.co:5432/postgres
 *
 * Usage:
 *   $env:SUPABASE_DB_PASSWORD="your-db-password"; node scripts/apply-professionals-migrations.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

for (const f of ['.env.local', '.env.migrate.run', '.env.migrate.tmp']) {
  loadEnvFile(path.join(root, f))
}

function resolveDbUrl() {
  const direct =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL
  if (direct && direct.length > 30) return direct

  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  const host =
    process.env.POSTGRES_HOST?.trim() ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase/)?.[1]
      ? `db.${process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase/)[1]}.supabase.co`
      : null)
  if (password && host) {
    const user = process.env.POSTGRES_USER?.trim() || 'postgres'
    const db = process.env.POSTGRES_DATABASE?.trim() || 'postgres'
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${db}`
  }
  return null
}

const migrationFiles = [
  '045_professionals.sql',
  '046_paid_addons.sql',
  '047_professionals_write_via_api.sql',
].map((f) => path.join(root, 'supabase', 'migrations', f))

const dbUrl = resolveDbUrl()
if (!dbUrl) {
  console.error(
    'Missing DB connection. Set POSTGRES_URL_NON_POOLING or SUPABASE_DB_PASSWORD (from Supabase Dashboard → Database).'
  )
  process.exit(1)
}

async function main() {
  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected')

  for (const file of migrationFiles) {
    if (!fs.existsSync(file)) {
      console.warn('Skip missing:', path.basename(file))
      continue
    }
    const sql = fs.readFileSync(file, 'utf8')
    console.log('Applying', path.basename(file), '...')
    await client.query(sql)
    console.log('OK', path.basename(file))
  }

  await client.end()
  console.log('All migrations applied.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
