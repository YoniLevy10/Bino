-- P0 bank match: per-building bank account, charge lifecycle, stronger match FKs.
-- Grow untouched. Service-role writes for building_bank_*; authenticated SELECT tenant-scoped.

-- ---------------------------------------------------------------------------
-- building_bank_accounts (collections ingest config per project)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.building_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  display_name text,
  bank_code text,
  branch_number text,
  account_number text,
  iban text,
  bban text,
  provider text,
  ingest_source text NOT NULL DEFAULT 'csv'
    CHECK (ingest_source IN ('csv', 'scraper')),
  connection_status text NOT NULL DEFAULT 'ready_for_import'
    CHECK (connection_status IN (
      'ready_for_import',
      'awaiting_import',
      'syncing',
      'ok',
      'error',
      'scraper_pending_legal'
    )),
  sync_enabled boolean NOT NULL DEFAULT false,
  sync_day_of_month smallint
    CHECK (sync_day_of_month IS NULL OR (sync_day_of_month >= 1 AND sync_day_of_month <= 28)),
  last_sync_at timestamptz,
  last_sync_error text,
  last_import_at timestamptz,
  -- Encrypted blob for future scraper credentials (never SELECT to browser).
  scraper_credentials_enc text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_bank_accounts_client_project
  ON public.building_bank_accounts (client_id, project_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_building_bank_accounts_sync_day
  ON public.building_bank_accounts (sync_day_of_month)
  WHERE sync_enabled = true AND is_active = true;

ALTER TABLE public.building_bank_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.building_bank_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.building_bank_accounts TO service_role;
-- Authenticated may read non-secret columns via API that strips scraper_credentials_enc.
GRANT SELECT (
  id, client_id, project_id, display_name, bank_code, branch_number, account_number,
  iban, bban, provider, ingest_source, connection_status, sync_enabled, sync_day_of_month,
  last_sync_at, last_sync_error, last_import_at, is_active, created_at, updated_at
) ON public.building_bank_accounts TO authenticated;

CREATE POLICY building_bank_accounts_tenant_select ON public.building_bank_accounts
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));

-- ---------------------------------------------------------------------------
-- Monthly sync idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.building_bank_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  year_month text NOT NULL,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'awaiting_import', 'ok', 'error')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_bank_sync_runs_project_month
  ON public.building_bank_sync_runs (client_id, project_id, year_month);

ALTER TABLE public.building_bank_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.building_bank_sync_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.building_bank_sync_runs TO service_role;

-- ---------------------------------------------------------------------------
-- bank_transactions: source, suggested match, project-scoped uniqueness
-- ---------------------------------------------------------------------------
ALTER TABLE public.bank_accounts
  DROP CONSTRAINT IF EXISTS bank_accounts_provider_check;

ALTER TABLE public.bank_accounts
  ADD CONSTRAINT bank_accounts_provider_check
  CHECK (provider IN ('financy', 'csv', 'scraper', 'manual'));

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'financy'
    CHECK (source IN ('financy', 'csv', 'scraper', 'manual')),
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'credit'
    CHECK (direction IN ('credit', 'debit')),
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS counterparty text,
  ADD COLUMN IF NOT EXISTS suggested_charge_id uuid,
  ADD COLUMN IF NOT EXISTS match_confidence text
    CHECK (match_confidence IS NULL OR match_confidence IN ('A', 'B', 'C', 'manual')),
  ADD COLUMN IF NOT EXISTS matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS matched_by uuid;

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_match_status_check;

ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_match_status_check
  CHECK (match_status IN (
    'unmatched',
    'suggested',
    'matched_charge',
    'matched_expense',
    'ignored',
    'unmatched_after_revoke'
  ));

-- Prefer project-scoped dedupe for CSV/scraper; keep legacy client+sk for Financy.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_client_project_sk
  ON public.bank_transactions (client_id, project_id, external_sk)
  WHERE project_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_matched_charge_id_fkey'
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_charge_id_fkey
      FOREIGN KEY (matched_charge_id) REFERENCES public.collection_charges (id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_suggested_charge_id_fkey'
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_suggested_charge_id_fkey
      FOREIGN KEY (suggested_charge_id) REFERENCES public.collection_charges (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- One active bank match per charge
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_tx_matched_charge_unique
  ON public.bank_transactions (matched_charge_id)
  WHERE matched_charge_id IS NOT NULL AND match_status = 'matched_charge';

-- ---------------------------------------------------------------------------
-- collection_charges: payment reference + lifecycle (no Grow changes)
-- ---------------------------------------------------------------------------
ALTER TABLE public.collection_charges
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirm_source text
    CHECK (
      payment_confirm_source IS NULL
      OR payment_confirm_source IN ('bank_match', 'grow', 'icount', 'manual', 'pis')
    ),
  ADD COLUMN IF NOT EXISTS funds_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid,
  ADD COLUMN IF NOT EXISTS gap_reminder_sent_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_charges_payment_reference
  ON public.collection_charges (client_id, payment_reference)
  WHERE payment_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_charges_bank_tx_unique
  ON public.collection_charges (bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_charges_bank_transaction_id_fkey'
  ) THEN
    ALTER TABLE public.collection_charges
      ADD CONSTRAINT collection_charges_bank_transaction_id_fkey
      FOREIGN KEY (bank_transaction_id) REFERENCES public.bank_transactions (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.collection_charges.payment_reference IS
  'Short transfer reference e.g. BINO-XXXX for bank matching / resident slips.';
COMMENT ON COLUMN public.collection_charges.payment_confirmed_at IS
  'When payment was confirmed (match/PSP/manual) — separate from accounting document.';
COMMENT ON COLUMN public.collection_charges.funds_received_at IS
  'When funds were linked to a bank transaction (may equal confirmed for CSV match).';
COMMENT ON TABLE public.building_bank_accounts IS
  'Per-building collections bank account + ingest schedule. Scraper secrets server-only.';
