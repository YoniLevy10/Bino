import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import pg from 'pg'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

function resolveDbUrl(): string | null {
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

const FILES = [
  '045_professionals.sql',
  '046_paid_addons.sql',
  '047_professionals_write_via_api.sql',
  '047_worker_attendance_nfc.sql',
  '048_worker_stamp_paid_addon.sql',
  '049_plan_pricing_catalog.sql',
]

function isAlreadyAppliedError(msg: string): boolean {
  return (
    msg.includes('already exists') ||
    msg.includes('duplicate key') ||
    msg.includes('duplicate_object')
  )
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUrl = resolveDbUrl()
  if (!dbUrl) {
    return NextResponse.json(
      {
        error:
          'No database URL. Set POSTGRES_URL_NON_POOLING or SUPABASE_DB_PASSWORD + POSTGRES_HOST on the server.',
      },
      { status: 500 }
    )
  }

  const root = process.cwd()
  const applied: string[] = []
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    const skipped: string[] = []
    for (const name of FILES) {
      const filePath = join(root, 'supabase', 'migrations', name)
      if (!existsSync(filePath)) {
        return NextResponse.json({ error: `Missing file ${name}` }, { status: 500 })
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
        throw err
      }
    }
    await client.end()
    return NextResponse.json({ success: true, applied, skipped })
  } catch (e) {
    try {
      await client.end()
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg, applied }, { status: 500 })
  }
}
