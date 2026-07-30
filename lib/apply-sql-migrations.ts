import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import pg from 'pg'

export const PENDING_MIGRATION_FILES = [
  '080_api_rate_limit_rpc.sql',
  '081_session_preferred_language.sql',
  '082_rate_limit_upsert.sql',
  // 087_workers_hide_access_token.sql — apply MANUALLY only AFTER the portal-link
  // deploy is live (see docs/SECURITY_HARDENING_PLAN.md). Auto-apply before UI
  // would break "copy worker link" for managers still on the old workers page.
] as const

/** Strip sslmode from URL so pg Client `ssl.rejectUnauthorized` applies (Vercel + Supabase). */
export function normalizePostgresUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('sslmode')
    u.searchParams.delete('supa')
    return u.toString()
  } catch {
    return url.replace(/[?&]sslmode=[^&]+/gi, '')
  }
}

export function resolvePostgresUrl(): string | null {
  const direct =
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim()
  if (direct && direct.length > 30) return normalizePostgresUrl(direct)

  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  const host = process.env.POSTGRES_HOST?.trim()
  if (password && host) {
    const user = process.env.POSTGRES_USER?.trim() || 'postgres'
    const db = process.env.POSTGRES_DATABASE?.trim() || 'postgres'
    return normalizePostgresUrl(
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${db}`
    )
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
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false,
      // Supabase pooler / Vercel: avoid SELF_SIGNED_CERT_IN_CHAIN on serverless
      checkServerIdentity: () => undefined,
    },
  })

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
