import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import pg from 'pg'

export const PENDING_MIGRATION_FILES = [
  '045_professionals.sql',
  '046_paid_addons.sql',
  '047_professionals_write_via_api.sql',
  '047_worker_attendance_nfc.sql',
  '048_worker_stamp_paid_addon.sql',
  '049_plan_pricing_catalog.sql',
] as const

export function resolvePostgresUrl(): string | null {
  const direct =
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim()
  if (direct && direct.length > 30) return direct

  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  const host = process.env.POSTGRES_HOST?.trim()
  if (password && host) {
    const user = process.env.POSTGRES_USER?.trim() || 'postgres'
    const db = process.env.POSTGRES_DATABASE?.trim() || 'postgres'
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${db}`
  }
  return null
}

function isAlreadyAppliedError(msg: string): boolean {
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate key') ||
    msg.includes('duplicate_object')
  )
}

export async function applyPendingSqlMigrations(cwd = process.cwd()): Promise<{
  applied: string[]
  skipped: string[]
  error?: string
}> {
  const dbUrl = resolvePostgresUrl()
  if (!dbUrl) {
    return { applied: [], skipped: [], error: 'No database URL on server' }
  }

  const applied: string[] = []
  const skipped: string[] = []
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    for (const name of PENDING_MIGRATION_FILES) {
      const filePath = join(cwd, 'supabase', 'migrations', name)
      if (!existsSync(filePath)) {
        return { applied, skipped, error: `Missing file ${name}` }
      }
      const sql = readFileSync(filePath, 'utf8')
      try {
        await client.query(sql)
        applied.push(name)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isAlreadyAppliedError(msg)) {
          skipped.push(name)
          continue
        }
        return { applied, skipped, error: `${name}: ${msg}` }
      }
    }
    return { applied, skipped }
  } finally {
    try {
      await client.end()
    } catch {
      /* ignore */
    }
  }
}
