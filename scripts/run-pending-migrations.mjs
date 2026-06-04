/**
 * Apply migration SQL via Postgres (Vercel production credentials).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const PROJECT = 'bamakor'

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

async function getVercelToken() {
  const authPath = path.join(
    process.env.APPDATA || '',
    'com.vercel.cli',
    'Data',
    'auth.json'
  )
  if (!fs.existsSync(authPath)) return null
  const j = JSON.parse(fs.readFileSync(authPath, 'utf8'))
  return j.token || null
}

async function fetchVercelProductionEnv() {
  const token = await getVercelToken()
  if (!token) return null

  const teamId = process.env.VERCEL_TEAM_ID
  const teamQ = teamId ? `?teamId=${teamId}` : ''
  const projRes = await fetch(`https://api.vercel.com/v9/projects/${PROJECT}${teamQ}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!projRes.ok) {
    console.error('Vercel project lookup failed', projRes.status)
    return null
  }
  const proj = await projRes.json()
  const projectId = proj.id

  const envRes = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true&target=production`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!envRes.ok) {
    console.error('Vercel env decrypt failed', envRes.status, await envRes.text())
    return null
  }
  const { envs } = await envRes.json()
  const map = {}
  for (const e of envs || []) {
    if (e.key && e.value != null) map[e.key] = e.value
  }
  return map
}

function buildDbUrl(env) {
  if (env.POSTGRES_URL_NON_POOLING?.length > 20) return env.POSTGRES_URL_NON_POOLING
  if (env.POSTGRES_URL?.length > 20) return env.POSTGRES_URL
  const host = env.POSTGRES_HOST
  const user = env.POSTGRES_USER || 'postgres'
  const pass = env.POSTGRES_PASSWORD
  const db = env.POSTGRES_DATABASE || 'postgres'
  if (!host || !pass) return null
  const enc = encodeURIComponent(pass)
  return `postgresql://${user}:${enc}@${host}/${db}?sslmode=require`
}

loadEnvFile(path.join(root, '.env.local'))
loadEnvFile(path.join(root, '.env.migrate.tmp'))

const migrationFiles = [
  '045_professionals.sql',
  '046_paid_addons.sql',
  '047_professionals_write_via_api.sql',
  '047_worker_attendance_nfc.sql',
  '048_worker_stamp_paid_addon.sql',
  '049_plan_pricing_catalog.sql',
  '050_paid_addons_full_catalog.sql',
].map((f) => path.join(root, 'supabase', 'migrations', f))

async function main() {
  let dbUrl = buildDbUrl(process.env)
  if (!dbUrl) {
    console.log('Fetching production DB credentials from Vercel API...')
    const vercelEnv = await fetchVercelProductionEnv()
    if (vercelEnv) dbUrl = buildDbUrl(vercelEnv)
  }

  if (!dbUrl) {
    console.error(
      'Could not resolve POSTGRES URL. Options: supabase login + db push, or set POSTGRES_URL_NON_POOLING in .env.local'
    )
    process.exit(1)
  }

  const { default: pg } = await import('pg')
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected to database')

  for (const file of migrationFiles) {
    if (!fs.existsSync(file)) {
      console.warn('Skip missing:', path.basename(file))
      continue
    }
    const sql = fs.readFileSync(file, 'utf8')
    console.log('Applying', path.basename(file), '...')
    try {
      await client.query(sql)
      console.log('OK', path.basename(file))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate key') ||
        msg.includes('duplicate_object')
      ) {
        console.log('Already applied (skip):', path.basename(file))
      } else {
        console.error('FAILED', path.basename(file), msg)
        await client.end()
        process.exit(1)
      }
    }
  }

  await client.end()
  console.log('All migrations finished.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
