import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import { applyPendingSqlMigrations } from '@/lib/apply-sql-migrations'


export async function POST(req: Request) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const result = await applyPendingSqlMigrations()
  if (result.error) {
    return NextResponse.json(result, { status: 500 })
  }
  return NextResponse.json({ success: true, ...result })
}
