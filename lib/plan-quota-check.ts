import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getClientPlanRow,
  effectiveMaxTicketsPerMonth,
  type ClientPlanRow,
} from '@/lib/plan-limits'
import { getPlanPricingRow } from '@/lib/plan-pricing'

export type PlanQuotaCheckResult =
  | { ok: true; client: ClientPlanRow; current: number; max: number | null }
  | { ok: false; error: string; current: number; max: number | null }

function monthStartIso(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

export async function checkTicketsMonthlyQuota(
  supabase: SupabaseClient,
  clientId: string
): Promise<PlanQuotaCheckResult> {
  const { data: client, error } = await getClientPlanRow(supabase, clientId)
  if (error || !client) {
    return { ok: false, error: 'לקוח לא נמצא', current: 0, max: null }
  }

  const max = effectiveMaxTicketsPerMonth(client, await getPlanPricingRow(supabase, client.plan_tier ?? 'starter'))
  const { count, error: countErr } = await supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('created_at', monthStartIso())
    .is('deleted_at', null)

  if (countErr) {
    return { ok: false, error: 'שגיאת שרת', current: 0, max }
  }

  const current = count ?? 0
  if (max !== null && current >= max) {
    return {
      ok: false,
      error: `הגעת למגבלת התקלות החודשית (${max}). שדרגו את החבילה או פנו לBino.`,
      current,
      max,
    }
  }

  return { ok: true, client, current, max }
}
