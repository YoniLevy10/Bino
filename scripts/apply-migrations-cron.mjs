/**
 * GET /api/cron/apply-pending-migrations on production (Bearer CRON_SECRET from .env.local).
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
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvFile(path.join(root, '.env.local'))

const secret = process.env.CRON_SECRET?.trim()
const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://bamakor.vercel.app').replace(/\/$/, '')

if (!secret) {
  console.error('Missing CRON_SECRET in .env.local')
  process.exit(1)
}

const url = `${base}/api/cron/apply-pending-migrations`
console.log('GET', url)

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${secret}` },
})
const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  json = { raw: text.slice(0, 800) }
}
console.log('Status', res.status)
console.log(JSON.stringify(json, null, 2))
process.exit(res.ok ? 0 : 1)
