-- PR-C: store signature content hash for audit / integrity (never delete signed rows).
-- Apply to production after review. No Supabase preview branches.

ALTER TABLE public.building_signature_requests
  ADD COLUMN IF NOT EXISTS signature_content_hash text;

COMMENT ON COLUMN public.building_signature_requests.signature_content_hash IS
  'SHA-256 hex of signature_data_url at sign time (audit trail; raw image still stored).';

CREATE INDEX IF NOT EXISTS idx_building_signature_requests_content_hash
  ON public.building_signature_requests (client_id, signature_content_hash)
  WHERE signature_content_hash IS NOT NULL;
