import { NextResponse } from 'next/server'

/** Tenant dashboards no longer expose failed notifications — see lib/platform-ops-alert.ts */
export async function GET() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
