import type { SupabaseClient } from '@supabase/supabase-js'
import { mbrainLog } from '@/lib/mbrain/logging'

export async function writeMbrainAudit(
  admin: SupabaseClient,
  opts: {
    organizationId: string
    actorUserId: string | null
    action: string
    entityType?: string
    entityId?: string
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    metadata?: Record<string, unknown>
  }
): Promise<void> {
  try {
    const { error } = await admin.from('mbrain_audit_logs').insert({
      organization_id: opts.organizationId,
      actor_user_id: opts.actorUserId,
      action: opts.action,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      before_state: opts.before ?? null,
      after_state: opts.after ?? null,
      metadata: opts.metadata ?? {},
    })
    if (error) mbrainLog('warn', 'audit_insert_failed', { message: error.message })
  } catch (e) {
    mbrainLog('warn', 'audit_insert_exception', {
      message: e instanceof Error ? e.message : String(e),
    })
  }
}
