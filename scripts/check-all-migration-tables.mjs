import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile(path.join(root, '.env.local'))

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const tables = [
  'professionals',
  'paid_addons_catalog',
  'client_paid_addons',
  'plan_pricing_catalog',
  'billing_platform_settings',
  'worker_nfc_tags',
  'worker_attendance_events',
]

for (const table of tables) {
  const { error } = await admin.from(table).select('*').limit(0)
  console.log(table, error ? `${error.code} ${error.message}` : 'ok')
}
