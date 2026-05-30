import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getEnvReadinessFlags } from '@/lib/env-readiness'

/**
 * Lightweight readiness: verifies Supabase service connectivity.
 */
export async function GET() {
  const envFlags = getEnvReadinessFlags()
  const envWarnings = envFlags.filter((f) => !f.ok).map((f) => f.key)

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('clients').select('id').limit(1)
    if (error) {
      console.error('[health]', error.message)
      return NextResponse.json(
        {
          status: 'error',
          db: 'disconnected',
          envWarnings,
          ts: new Date().toISOString(),
        },
        { status: 503 }
      )
    }
    return NextResponse.json({
      status: 'ok',
      db: 'connected',
      envWarnings,
      ts: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[health]', e instanceof Error ? e.message : String(e))
    return NextResponse.json(
      {
        status: 'error',
        db: 'disconnected',
        envWarnings,
        ts: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
