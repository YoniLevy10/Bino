import { NextResponse } from 'next/server'
import { applyPendingSqlMigrations } from '@/lib/apply-sql-migrations'

function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET?.trim()
  if (!secret) return false
  return (req.headers.get('x-admin-secret') ?? '') === secret
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await applyPendingSqlMigrations()
  if (result.error) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json({ success: true, ...result })
}
