import type { SupabaseClient } from '@supabase/supabase-js'

/** Extract Web Push endpoint URL from a PushSubscription JSON blob. */
export function pushSubscriptionEndpoint(subscription: unknown): string | null {
  if (!subscription || typeof subscription !== 'object') return null
  const endpoint = (subscription as { endpoint?: unknown }).endpoint
  return typeof endpoint === 'string' && endpoint.trim().length > 0 ? endpoint.trim() : null
}

/**
 * One browser Push endpoint may only belong to one tenant at a time.
 * Removes the endpoint from every other manager/worker subscription row
 * so Client A ticket pushes never reach a phone now used for Client B.
 */
export async function revokePushEndpointFromOtherTenants(
  admin: SupabaseClient,
  opts: {
    endpoint: string
    keepManager?: { userId: string; clientId: string }
    keepWorker?: { workerId: string; clientId: string }
  }
): Promise<void> {
  const endpoint = opts.endpoint.trim()
  if (!endpoint) return

  // Manager table: drop every row with this endpoint except the one we are keeping.
  const { data: managerRows } = await admin
    .from('push_subscriptions')
    .select('id, user_id, client_id, subscription')

  const managerIdsToDelete = (managerRows || [])
    .filter((row) => pushSubscriptionEndpoint(row.subscription) === endpoint)
    .filter((row) => {
      if (!opts.keepManager) return true
      return !(row.user_id === opts.keepManager.userId && row.client_id === opts.keepManager.clientId)
    })
    .map((row) => row.id as string)
    .filter(Boolean)

  if (managerIdsToDelete.length) {
    await admin.from('push_subscriptions').delete().in('id', managerIdsToDelete)
  }

  const { data: workerRows } = await admin
    .from('worker_push_subscriptions')
    .select('id, worker_id, client_id, subscription')

  const workerIdsToDelete = (workerRows || [])
    .filter((row) => pushSubscriptionEndpoint(row.subscription) === endpoint)
    .filter((row) => {
      if (!opts.keepWorker) return true
      return !(row.worker_id === opts.keepWorker.workerId && row.client_id === opts.keepWorker.clientId)
    })
    .map((row) => row.id as string)
    .filter(Boolean)

  if (workerIdsToDelete.length) {
    await admin.from('worker_push_subscriptions').delete().in('id', workerIdsToDelete)
  }
}

/**
 * Upsert manager subscription for current tenant, then revoke the same endpoint
 * from any other tenant (manager or worker).
 */
export async function upsertExclusiveManagerPushSubscription(
  admin: SupabaseClient,
  opts: { clientId: string; userId: string; subscription: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const endpoint = pushSubscriptionEndpoint(opts.subscription)
  if (!endpoint) return { ok: false, error: 'subscription endpoint חסר' }

  const { error } = await admin.from('push_subscriptions').upsert(
    {
      client_id: opts.clientId,
      user_id: opts.userId,
      subscription: opts.subscription,
    },
    { onConflict: 'user_id,client_id' }
  )
  if (error) return { ok: false, error: error.message }

  await revokePushEndpointFromOtherTenants(admin, {
    endpoint,
    keepManager: { userId: opts.userId, clientId: opts.clientId },
  })
  return { ok: true }
}

/**
 * Upsert worker subscription for current tenant, then revoke the same endpoint
 * from any other tenant (manager or worker).
 */
export async function upsertExclusiveWorkerPushSubscription(
  admin: SupabaseClient,
  opts: { clientId: string; workerId: string; subscription: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const endpoint = pushSubscriptionEndpoint(opts.subscription)
  if (!endpoint) return { ok: false, error: 'subscription endpoint חסר' }

  const { error } = await admin.from('worker_push_subscriptions').upsert(
    {
      worker_id: opts.workerId,
      client_id: opts.clientId,
      subscription: opts.subscription,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'worker_id,client_id' }
  )
  if (error && error.code !== '23505') return { ok: false, error: error.message }

  await revokePushEndpointFromOtherTenants(admin, {
    endpoint,
    keepWorker: { workerId: opts.workerId, clientId: opts.clientId },
  })
  return { ok: true }
}

/** Delete manager push rows for this user (all tenants) and optionally revoke endpoint everywhere. */
export async function deleteManagerPushSubscriptionsForUser(
  admin: SupabaseClient,
  opts: { userId: string; endpoint?: string | null }
): Promise<void> {
  await admin.from('push_subscriptions').delete().eq('user_id', opts.userId)
  if (opts.endpoint) {
    await revokePushEndpointFromOtherTenants(admin, { endpoint: opts.endpoint })
  }
}

/** Delete worker push rows for this worker+tenant and optionally revoke endpoint everywhere. */
export async function deleteWorkerPushSubscriptionsForWorker(
  admin: SupabaseClient,
  opts: { workerId: string; clientId: string; endpoint?: string | null }
): Promise<void> {
  await admin
    .from('worker_push_subscriptions')
    .delete()
    .eq('worker_id', opts.workerId)
    .eq('client_id', opts.clientId)
  if (opts.endpoint) {
    await revokePushEndpointFromOtherTenants(admin, { endpoint: opts.endpoint })
  }
}
