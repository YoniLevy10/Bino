/**
 * Approval engine — financial/sensitive actions never auto-execute without policy.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { assertGuardrailsAllow, type Guardrails } from '@/lib/mbrain/guardrails'

export const approvalActionSchema = z.enum([
  'launch_campaign',
  'increase_budget',
  'change_geography',
  'increase_max_spend',
  'change_objective',
])

export type ApprovalAction = z.infer<typeof approvalActionSchema>

export async function requestApproval(
  admin: SupabaseClient,
  opts: {
    organizationId: string
    brandId: string | null
    actionType: ApprovalAction
    targetType: string
    targetId: string
    requestedBy: string
    budgetApproved?: number | null
    payload: Record<string, unknown>
    guardrails: Guardrails
  }
): Promise<{ id: string; status: string }> {
  if (opts.actionType === 'launch_campaign' || opts.actionType === 'increase_budget') {
    assertGuardrailsAllow({
      guardrails: opts.guardrails,
      proposedDailyBudget:
        typeof opts.payload.dailyBudget === 'number' ? opts.payload.dailyBudget : opts.budgetApproved,
      projectedMonthlySpend:
        typeof opts.payload.projectedMonthlySpend === 'number'
          ? opts.payload.projectedMonthlySpend
          : null,
      currentDailyBudget:
        typeof opts.payload.currentDailyBudget === 'number' ? opts.payload.currentDailyBudget : null,
    })
  }

  const { data, error } = await admin
    .from('mbrain_approvals')
    .insert({
      organization_id: opts.organizationId,
      brand_id: opts.brandId,
      action_type: opts.actionType,
      target_type: opts.targetType,
      target_id: opts.targetId,
      status: 'pending',
      requested_by: opts.requestedBy,
      budget_approved: opts.budgetApproved ?? null,
      payload: opts.payload,
    })
    .select('id, status')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function decideApproval(
  admin: SupabaseClient,
  opts: {
    organizationId: string
    approvalId: string
    decision: 'approved' | 'rejected'
    decidedBy: string
    note?: string
  }
): Promise<Record<string, unknown>> {
  const { data: before } = await admin
    .from('mbrain_approvals')
    .select('*')
    .eq('id', opts.approvalId)
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  if (!before) throw new Error('Approval not found')
  if (before.status !== 'pending') throw new Error('Approval already decided')

  const { data, error } = await admin
    .from('mbrain_approvals')
    .update({
      status: opts.decision,
      approved_by: opts.decidedBy,
      decided_at: new Date().toISOString(),
      decision_note: opts.note ?? null,
    })
    .eq('id', opts.approvalId)
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}
