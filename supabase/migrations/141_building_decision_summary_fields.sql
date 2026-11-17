-- PR-I — Decision summary: optional PDF attachment + vote_choice for approve/oppose/abstain.
-- Numbered 141+ to avoid collisions with open PRs (137 expense sum, 138 paid_spend / PR-H
-- document+vote on some branches, 139 signature hash; leave 140 for PR-H renumber if needed).
-- Idempotent (IF NOT EXISTS) — safe if PR-H already applied the same columns.

ALTER TABLE public.building_decisions
  ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.project_documents (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.building_decisions.document_id IS
  'Optional project document (PDF) attached to the decision for resident preview / manager summary link.';

CREATE INDEX IF NOT EXISTS idx_building_decisions_document
  ON public.building_decisions (client_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE public.building_signature_requests
  ADD COLUMN IF NOT EXISTS vote_choice text
    CHECK (vote_choice IS NULL OR vote_choice IN ('approve', 'oppose', 'abstain'));

COMMENT ON COLUMN public.building_signature_requests.vote_choice IS
  'approve | oppose | abstain. NULL on signed rows = approve (backward compatible).';

CREATE INDEX IF NOT EXISTS idx_building_signature_requests_vote
  ON public.building_signature_requests (decision_id, status, vote_choice);
