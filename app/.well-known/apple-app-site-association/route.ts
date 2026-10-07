import { NextResponse } from 'next/server'
import { buildAppleAppSiteAssociation } from '@/lib/apple-app-site-association'

export const dynamic = 'force-dynamic'

/** Served at https://bino.casa/.well-known/apple-app-site-association once APPLE_TEAM_ID is set. */
export function GET() {
  const body = buildAppleAppSiteAssociation(process.env.APPLE_TEAM_ID || '')
  if (!body) return new NextResponse(null, { status: 404 })
  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
