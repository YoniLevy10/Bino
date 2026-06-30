-- Pending approval when a WhatsApp reporter is not yet in the project's residents directory.

CREATE TABLE IF NOT EXISTS pending_resident_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  ticket_id UUID REFERENCES tickets (id) ON DELETE SET NULL,
  reporter_phone_normalized TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT
);

ALTER TABLE pending_resident_join_requests
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_pending_resident_client ON pending_resident_join_requests (client_id);

CREATE INDEX IF NOT EXISTS idx_pending_resident_project ON pending_resident_join_requests (project_id);

CREATE INDEX IF NOT EXISTS idx_pending_resident_status ON pending_resident_join_requests (status);

CREATE UNIQUE INDEX IF NOT EXISTS pending_resident_join_one_open_per_phone_project ON pending_resident_join_requests (
  client_id,
  project_id,
  reporter_phone_normalized
)
WHERE
  status = 'pending';

ALTER TABLE pending_resident_join_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "service_role_bypass" ON pending_resident_join_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE POLICY "anon_dashboard_pending_resident_join_requests" ON pending_resident_join_requests
    FOR ALL TO anon USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
