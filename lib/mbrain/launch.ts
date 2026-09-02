/**
 * Launch approved campaign to Meta (mock or live) with idempotency.
 * On Meta API failure, local campaign stays in failed/pending — no corrupted "active" without IDs.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createMetaAd,
  createMetaAdSet,
  createMetaCampaign,
  setMetaCampaignStatus,
  toMetaBudgetMinor,
} from '@/lib/mbrain/meta/campaigns'
import { getMetaMode } from '@/lib/mbrain/meta/client'
import { mbrainLog } from '@/lib/mbrain/logging'
import { assertGuardrailsAllow, type Guardrails } from '@/lib/mbrain/guardrails'

export async function executeApprovedLaunch(
  admin: SupabaseClient,
  opts: {
    organizationId: string
    campaignId: string
    approvalId: string
    guardrails: Guardrails
  }
): Promise<{ campaign: Record<string, unknown>; metaMode: string; label: string }> {
  const { data: approval } = await admin
    .from('mbrain_approvals')
    .select('*')
    .eq('id', opts.approvalId)
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  if (!approval || approval.status !== 'approved') {
    throw new Error('Launch requires an approved approval record')
  }
  if (approval.target_id !== opts.campaignId) {
    throw new Error('Approval target mismatch')
  }

  const { data: campaign } = await admin
    .from('mbrain_campaigns')
    .select('*')
    .eq('id', opts.campaignId)
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  if (!campaign) throw new Error('Campaign not found')

  // Idempotent: already launched
  if (campaign.meta_external_id && campaign.status === 'active') {
    return { campaign, metaMode: getMetaMode(), label: getMetaMode() === 'live' ? 'LIVE META DATA' : 'MOCK DATA' }
  }

  const daily = Number(campaign.daily_budget ?? 0)
  assertGuardrailsAllow({
    guardrails: opts.guardrails,
    proposedDailyBudget: daily,
    projectedMonthlySpend: daily * 30,
  })

  const { data: metaAccount } = await admin
    .from('mbrain_meta_accounts')
    .select('*')
    .eq('organization_id', opts.organizationId)
    .eq('is_selected', true)
    .maybeSingle()

  if (!metaAccount) throw new Error('No selected Meta ad account')

  const { data: connection } = await admin
    .from('mbrain_meta_connections')
    .select('access_token_encrypted, status')
    .eq('organization_id', opts.organizationId)
    .maybeSingle()

  // Token decryption lands with Phase D OAuth; mock mode uses null token.
  const accessToken =
    getMetaMode() === 'live' && connection?.access_token_encrypted
      ? connection.access_token_encrypted
      : null

  const idem = campaign.launch_idempotency_key ?? campaign.id

  try {
    const created = await createMetaCampaign({
      adAccountId: metaAccount.ad_account_id,
      name: campaign.name,
      objective: campaign.objective,
      status: 'PAUSED',
      dailyBudgetMinorUnits: toMetaBudgetMinor(daily),
      accessToken,
      idempotencyKey: idem,
    })

    const { data: adSets } = await admin
      .from('mbrain_ad_sets')
      .select('*')
      .eq('campaign_id', campaign.id)

    for (const adSet of adSets ?? []) {
      const metaAdSet = await createMetaAdSet({
        adAccountId: metaAccount.ad_account_id,
        campaignId: created.metaCampaignId,
        name: adSet.name,
        dailyBudgetMinorUnits: toMetaBudgetMinor(Number(adSet.daily_budget ?? daily)),
        accessToken,
        idempotencyKey: `${idem}:${adSet.id}`,
        targeting: (adSet.targeting as Record<string, unknown>) ?? undefined,
      })

      await admin
        .from('mbrain_ad_sets')
        .update({ meta_external_id: metaAdSet.metaAdSetId, status: 'created' })
        .eq('id', adSet.id)

      const { data: ads } = await admin.from('mbrain_ads').select('*').eq('ad_set_id', adSet.id)
      for (const ad of ads ?? []) {
        const metaAd = await createMetaAd({
          adAccountId: metaAccount.ad_account_id,
          adSetId: metaAdSet.metaAdSetId,
          name: ad.name,
          creativeId: `creative_local_${ad.creative_id}`,
          accessToken,
          idempotencyKey: `${idem}:${ad.id}`,
        })
        await admin
          .from('mbrain_ads')
          .update({
            meta_external_id: metaAd.metaAdId,
            meta_creative_id: `creative_local_${ad.creative_id}`,
            status: 'created',
          })
          .eq('id', ad.id)
      }
    }

    await setMetaCampaignStatus({
      campaignId: created.metaCampaignId,
      status: 'ACTIVE',
      accessToken,
    })

    const { data: updated, error } = await admin
      .from('mbrain_campaigns')
      .update({
        status: 'active',
        meta_external_id: created.metaCampaignId,
        meta_account_id: metaAccount.ad_account_id,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)

    await admin
      .from('mbrain_approvals')
      .update({ status: 'executed', executed_at: new Date().toISOString() })
      .eq('id', opts.approvalId)

    return {
      campaign: updated,
      metaMode: getMetaMode(),
      label: created.label,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    mbrainLog('error', 'campaign_launch_failed', { campaignId: campaign.id, message })
    await admin
      .from('mbrain_campaigns')
      .update({
        status: 'failed',
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)
    throw e
  }
}
