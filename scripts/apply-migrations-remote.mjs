/**
 * POST /api/admin/apply-professionals-migrations on production (after deploy).
 * Reads ADMIN_SETUP_SECRET and app URL from .env.migrate.tmp or .env.local.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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
    process.env[key] = val
  }
}

loadEnvFile(path.join(root, '.env.local'))
loadEnvFile(path.join(root, '.env.migrate.tmp'))

const secret = process.env.ADMIN_SETUP_SECRET?.trim()
const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://bamakor.vercel.app').replace(/\/$/, '')

if (!secret) {
  console.error('Missing ADMIN_SETUP_SECRET')
  process.exit(1)
}

const url = `${base}/api/admin/apply-professionals-migrations`
console.log('POST', url)

const res = await fetch(url, {
  method: 'POST',
  headers: { 'x-admin-secret': secret },
})
const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  json = { raw: text.slice(0, 500) }
}
console.log('Status', res.status)
console.log(JSON.stringify(json, null, 2))
process.exit(res.ok ? 0 : 1)
