-- 099_growth_outreach_experiments.sql
-- Growth OS Phase 2+6: sequences, interactions, experiments, conversions

CREATE TABLE IF NOT EXISTS public.growth_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'whatsapp', 'linkedin_manual', 'phone_task')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  description TEXT,
  stop_on_reply BOOLEAN NOT NULL DEFAULT true,
  stop_on_opt_out BOOLEAN NOT NULL DEFAULT true,
  stop_on_demo_booked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.growth_sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  delay_days INT NOT NULL DEFAULT 0,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  angle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.growth_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES public.growth_sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.growth_leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'stopped_reply', 'stopped_opt_out', 'stopped_demo', 'stopped_invalid')),
  current_step INT NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ,
  stop_reason TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_growth_enrollments_next
  ON public.growth_sequence_enrollments (organization_id, status, next_run_at);

CREATE TABLE IF NOT EXISTS public.growth_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.growth_leads(id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.growth_sequence_enrollments(id) ON DELETE SET NULL,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('outbound', 'inbound', 'system')),
  kind TEXT NOT NULL DEFAULT 'message'
    CHECK (kind IN ('message', 'email', 'whatsapp', 'call', 'note', 'opt_out', 'demo', 'other')),
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sent', 'failed', 'received', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_interactions_lead
  ON public.growth_interactions (lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.growth_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  goal_id UUID REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'inconclusive')),
  primary_metric TEXT NOT NULL DEFAULT 'qualified_demo_rate',
  secondary_metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  audience TEXT,
  budget_total NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'ILS',
  mbrain_campaign_id UUID REFERENCES public.mbrain_campaigns(id) ON DELETE SET NULL,
  winner_arm_id UUID,
  result_summary TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_arms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  variant_key TEXT NOT NULL,
  description TEXT,
  creative_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  budget_share NUMERIC(5, 2),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, variant_key)
);

CREATE TABLE IF NOT EXISTS public.growth_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.growth_leads(id) ON DELETE SET NULL,
  experiment_id UUID REFERENCES public.growth_experiments(id) ON DELETE SET NULL,
  mbrain_lead_id UUID REFERENCES public.mbrain_leads(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'impression', 'click', 'landing', 'lead', 'qualified',
      'demo_booked', 'customer', 'opt_out'
    )),
  channel TEXT,
  spend_attributed NUMERIC(12, 2),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_conversions_org_event
  ON public.growth_conversions (organization_id, event_type, occurred_at DESC);

-- RLS
ALTER TABLE public.growth_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_sequence_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_experiment_arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_conversions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY growth_sequences_service ON public.growth_sequences FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_sequence_steps_service ON public.growth_sequence_steps FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_enrollments_service ON public.growth_sequence_enrollments FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_interactions_service ON public.growth_interactions FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_experiments_service ON public.growth_experiments FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_experiment_arms_service ON public.growth_experiment_arms FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_conversions_service ON public.growth_conversions FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY growth_sequences_member ON public.growth_sequences FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_enrollments_member ON public.growth_sequence_enrollments FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_interactions_member ON public.growth_interactions FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_experiments_member ON public.growth_experiments FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_conversions_member ON public.growth_conversions FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_learnings_member_write ON public.growth_learnings FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Steps: access via sequence org membership through join is complex; service_role for API, member via sequence ownership check in app.
DO $$ BEGIN CREATE POLICY growth_sequence_steps_member ON public.growth_sequence_steps FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.growth_sequences s
    WHERE s.id = sequence_id AND public.mbrain_is_org_member(s.organization_id)
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY growth_experiment_arms_member ON public.growth_experiment_arms FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.growth_experiments e
    WHERE e.id = experiment_id AND public.mbrain_is_org_member(e.organization_id)
  )
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.growth_sequence_enrollments IS 'Stop on reply / opt-out / demo — never spam';
COMMENT ON TABLE public.growth_conversions IS 'Business funnel events — separate from vanity Meta metrics';
