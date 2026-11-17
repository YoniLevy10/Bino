-- PR-H — Attach project document (PDF) to building decisions + vote choice on signatures.
-- Majority counts approve only; signed rows with NULL vote_choice count as approve (compat).

ALTER TABLE public.building_decisions
  ADD COLUMN IF NOT EXISTS document_id uuid
    REFERENCES public.project_documents (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.building_decisions.document_id IS
  'Optional project_documents row (PDF/protocol) shown to residents before signing.';

CREATE INDEX IF NOT EXISTS idx_building_decisions_document
  ON public.building_decisions (client_id, document_id)
  WHERE document_id IS NOT NULL;

ALTER TABLE public.building_signature_requests
  ADD COLUMN IF NOT EXISTS vote_choice text
    CHECK (vote_choice IS NULL OR vote_choice IN ('approve', 'oppose', 'abstain'));

COMMENT ON COLUMN public.building_signature_requests.vote_choice IS
  'approve | oppose | abstain. NULL on legacy signed rows = treat as approve for majority.';

CREATE INDEX IF NOT EXISTS idx_building_signature_requests_vote
  ON public.building_signature_requests (decision_id, status, vote_choice)
  WHERE status = 'signed';
