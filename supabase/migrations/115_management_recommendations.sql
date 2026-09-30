-- Management recommendations layer: persisted attention items per tenant.
-- Additive only — does not alter existing ticket/task/charge business data semantics.

-- 1) Optional follow-up timestamp for professional tracking (not inferred from free text)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS professional_follow_up_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tickets.professional_follow_up_at IS
  'Manager-set follow-up time for professional escort/forward paths. Null = none.';

CREATE INDEX IF NOT EXISTS idx_tickets_client_professional_follow_up
  ON public.tickets (client_id, professional_follow_up_at)
  WHERE deleted_at IS NULL AND professional_follow_up_at IS NOT NULL;

-- 2) Recommendations
CREATE TABLE IF NOT EXISTS public.management_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('ticket', 'maintenance_task', 'project', 'collection_bucket')),
  entity_id UUID NOT NULL,
  dedupe_key TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'medium'
    CHECK (urgency IN ('critical', 'high', 'medium', 'low')),
  reason TEXT NOT NULL,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  primary_action TEXT,
  primary_action_href TEXT,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'snoozed', 'resolved', 'irrelevant')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  snoozed_until TIMESTAMPTZ,
  acted_by TEXT,
  acted_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_source TEXT,
  last_validated_at TIMESTAMPTZ,
  CONSTRAINT management_recommendations_client_dedupe UNIQUE (client_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_mgmt_recs_client_status_urgency
  ON public.management_recommendations (client_id, status, urgency, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_mgmt_recs_client_entity
  ON public.management_recommendations (client_id, entity_type, entity_id)
  WHERE status IN ('active', 'snoozed');

ALTER TABLE public.management_recommendations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.management_recommendations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_tenant_management_recommendations ON public.management_recommendations;
CREATE POLICY authenticated_tenant_management_recommendations ON public.management_recommendations
  FOR SELECT
  TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));

-- Writes go through service-role API routes only
REVOKE INSERT, UPDATE, DELETE ON TABLE public.management_recommendations FROM anon, authenticated;
GRANT SELECT ON TABLE public.management_recommendations TO authenticated;

COMMENT ON TABLE public.management_recommendations IS
  'In-app managerial recommendations per tenant. Detection is separate from display and outbound alerts.';

-- 3) Recommendation events (measurement; click ≠ success)
CREATE TABLE IF NOT EXISTS public.management_recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  recommendation_id UUID NOT NULL REFERENCES public.management_recommendations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'shown', 'opened', 'snoozed', 'dismissed',
      'action_chosen', 'action_succeeded', 'condition_cleared', 'midrag_search_opened'
    )),
  actor TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mgmt_rec_events_rec_created
  ON public.management_recommendation_events (recommendation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mgmt_rec_events_client_created
  ON public.management_recommendation_events (client_id, created_at DESC);

ALTER TABLE public.management_recommendation_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.management_recommendation_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON TABLE public.management_recommendation_events FROM anon, authenticated;

COMMENT ON TABLE public.management_recommendation_events IS
  'Analytics for recommendation lifecycle. action_chosen is not treated as completion.';

-- 4) Atomic upsert — parallel detectors cannot create duplicate active rows
CREATE OR REPLACE FUNCTION public.upsert_management_recommendation(
  p_client_id UUID,
  p_recommendation_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_dedupe_key TEXT,
  p_urgency TEXT,
  p_reason TEXT,
  p_facts JSONB,
  p_primary_action TEXT,
  p_primary_action_href TEXT,
  p_actions JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.management_recommendations (
    client_id, recommendation_type, entity_type, entity_id, dedupe_key,
    urgency, reason, facts, primary_action, primary_action_href, actions,
    status, detected_at, updated_at, last_validated_at
  ) VALUES (
    p_client_id, p_recommendation_type, p_entity_type, p_entity_id, p_dedupe_key,
    p_urgency, p_reason, COALESCE(p_facts, '{}'::jsonb),
    p_primary_action, p_primary_action_href, COALESCE(p_actions, '[]'::jsonb),
    'active', v_now, v_now, v_now
  )
  ON CONFLICT (client_id, dedupe_key) DO UPDATE SET
    recommendation_type = EXCLUDED.recommendation_type,
    entity_type = EXCLUDED.entity_type,
    entity_id = EXCLUDED.entity_id,
    urgency = EXCLUDED.urgency,
    reason = EXCLUDED.reason,
    facts = EXCLUDED.facts,
    primary_action = EXCLUDED.primary_action,
    primary_action_href = EXCLUDED.primary_action_href,
    actions = EXCLUDED.actions,
    updated_at = v_now,
    last_validated_at = v_now,
    status = CASE
      WHEN management_recommendations.status = 'snoozed'
        AND management_recommendations.snoozed_until IS NOT NULL
        AND management_recommendations.snoozed_until > v_now
        THEN 'snoozed'
      WHEN management_recommendations.status = 'irrelevant'
        THEN 'irrelevant'
      ELSE 'active'
    END,
    -- Clear resolution markers when condition is detected again after resolve
    resolved_at = CASE
      WHEN management_recommendations.status = 'resolved' THEN NULL
      ELSE management_recommendations.resolved_at
    END,
    resolved_by = CASE
      WHEN management_recommendations.status = 'resolved' THEN NULL
      ELSE management_recommendations.resolved_by
    END,
    resolution_source = CASE
      WHEN management_recommendations.status = 'resolved' THEN NULL
      ELSE management_recommendations.resolution_source
    END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_management_recommendation(
  UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_management_recommendation(
  UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB
) TO service_role;
