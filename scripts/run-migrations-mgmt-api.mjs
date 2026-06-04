/**
 * Run migrations via Supabase Management API (needs SUPABASE_ACCESS_TOKEN).
 * Create token: https://supabase.com/dashboard/account/tokens
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PROJECT_REF = 'jsliqlmjksintyigkulq'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

loadEnvFile(path.join(root, '.env.local'))

const files = [
  '045_professionals.sql',
  '046_paid_addons.sql',
  '047_professionals_write_via_api.sql',
  '047_worker_attendance_nfc.sql',
  '048_worker_stamp_paid_addon.sql',
  '049_plan_pricing_catalog.sql',
]

async function runQuery(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { ok: res.ok, status: res.status, body }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  if (!token) {
    console.error('Missing SUPABASE_ACCESS_TOKEN in .env.local')
    console.error('Create one at https://supabase.com/dashboard/account/tokens then add:')
    console.error('SUPABASE_ACCESS_TOKEN=sbp_...')
    process.exit(1)
  }

  for (const name of files) {
    const file = path.join(root, 'supabase', 'migrations', name)
    if (!fs.existsSync(file)) {
      console.warn('Skip', name)
      continue
    }
    const sql = fs.readFileSync(file, 'utf8')
    console.log('Applying', name, '...')
    const { ok, status, body } = await runQuery(token, sql)
    if (ok) {
      console.log('OK', name)
      continue
    }
    const msg = typeof body === 'string' ? body : JSON.stringify(body)
    if (msg.includes('already exists') || msg.includes('duplicate')) {
      console.log('Already applied:', name)
      continue
    }
    console.error('FAILED', name, status, msg.slice(0, 500))
    process.exit(1)
  }
  console.log('Done.')
}

main()
