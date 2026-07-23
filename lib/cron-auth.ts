import { type NextRequest } from 'next/server'
import { secureStringEqual } from '@/lib/secure-compare'

/** Vercel Cron and manual triggers: Authorization Bearer CRON_SECRET only. */
export function verifyCronRequest(req: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  const auth = req.headers.get('authorization') || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!bearer) return false
  return secureStringEqual(bearer, secret)
}
