import type { Json } from '@/lib/database.types'
import type { FixlyJobStatus, TicketFixlyMetadata } from '@/lib/fixly-types'

export function readFixlyMetadata(ticketMetadata: unknown): TicketFixlyMetadata | null {
  if (!ticketMetadata || typeof ticketMetadata !== 'object' || Array.isArray(ticketMetadata)) {
    return null
  }
  const fixly = (ticketMetadata as Record<string, unknown>).fixly
  if (!fixly || typeof fixly !== 'object' || Array.isArray(fixly)) return null
  const row = fixly as Record<string, unknown>
  const jobId = typeof row.job_id === 'string' ? row.job_id.trim() : ''
  const lastStatus = typeof row.last_status === 'string' ? row.last_status.trim() : ''
  const launchedAt = typeof row.launched_at === 'string' ? row.launched_at : ''
  if (!jobId || !lastStatus || !launchedAt) return null
  return {
    job_id: jobId,
    launched_at: launchedAt,
    last_status: lastStatus as FixlyJobStatus,
    trade: typeof row.trade === 'string' ? row.trade : undefined,
    last_event_id: typeof row.last_event_id === 'string' ? row.last_event_id : null,
    professional_name: typeof row.professional_name === 'string' ? row.professional_name : null,
    professional_phone: typeof row.professional_phone === 'string' ? row.professional_phone : null,
  }
}

export function mergeFixlyMetadata(
  ticketMetadata: unknown,
  patch: Partial<TicketFixlyMetadata> & Pick<TicketFixlyMetadata, 'job_id' | 'last_status' | 'launched_at'>
): Json {
  const base =
    ticketMetadata && typeof ticketMetadata === 'object' && !Array.isArray(ticketMetadata)
      ? { ...(ticketMetadata as Record<string, unknown>) }
      : {}
  const prev = readFixlyMetadata(ticketMetadata)
  base.fixly = {
    ...(prev || {}),
    ...patch,
  }
  return base as Json
}
