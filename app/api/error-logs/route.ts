import { NextResponse } from 'next/server'

/** Tenant dashboards no longer expose error logs — see lib/platform-ops-alert.ts */
export async function POST() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
