-- Financy bank OS: per-client credentials + bank accounts/transactions/transfers.
-- Writes via service_role API only. Do not GRANT secret columns to authenticated.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS financy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financy_client_id text,
  ADD COLUMN IF NOT EXISTS financy_client_secret text,
  ADD COLUMN IF NOT EXISTS financy_user_id text;

COMMENT ON COLUMN public.clients.financy_client_id IS
  'Financy API clientId (Settings → API). Server-only; never expose to browser SELECT grants.';
COMMENT ON COLUMN public.clients.financy_client_secret IS
  'Financy API clientSecret. Server-only.';
COMMENT ON COLUMN public.clients.financy_user_id IS
  'Financy API userId for this BINO tenant.';

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'financy'
    CHECK (provider = 'financy'),
  external_account_id text NOT NULL,
  connection_id text,
  account_type text,
  display_name text,
  currency text NOT NULL DEFAULT 'ILS',
  balance numeric(14, 2),
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_accounts_client_external
  ON public.bank_accounts (client_id, external_account_id);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_client_project
  ON public.bank_accounts (client_id, project_id);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES public.bank_accounts (id) ON DELETE SET NULL,
  external_id text NOT NULL,
  external_sk text NOT NULL,
  amount numeric(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  booked_at date,
  description text,
  merchant_name text,
  category_main text,
  category_sub text,
  match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched_charge', 'matched_expense', 'ignored')),
  matched_charge_id uuid,
  matched_expense_id uuid,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_client_sk
  ON public.bank_transactions (client_id, external_sk);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_client_booked
  ON public.bank_transactions (client_id, booked_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_project_booked
  ON public.bank_transactions (client_id, project_id, booked_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.bank_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  financy_payment_id text NOT NULL,
  external_id text NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ILS',
  description text,
  payee_name text,
  payee_account text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending_bank', 'succeeded', 'failed', 'canceled')),
  pay_url text,
  expense_id uuid REFERENCES public.building_expenses (id) ON DELETE SET NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transfers_client_external
  ON public.bank_transfers (client_id, external_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transfers_client_payment
  ON public.bank_transfers (client_id, financy_payment_id);

CREATE INDEX IF NOT EXISTS idx_bank_transfers_client_created
  ON public.bank_transfers (client_id, created_at DESC);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transfers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.bank_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.bank_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.bank_transfers FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.bank_accounts TO service_role;
GRANT ALL ON public.bank_transactions TO service_role;
GRANT ALL ON public.bank_transfers TO service_role;

-- Primary access is service_role via API. Optional authenticated read for same tenant.
GRANT SELECT ON public.bank_accounts TO authenticated;
GRANT SELECT ON public.bank_transactions TO authenticated;
GRANT SELECT ON public.bank_transfers TO authenticated;

CREATE POLICY bank_accounts_tenant_select ON public.bank_accounts
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));

CREATE POLICY bank_transactions_tenant_select ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));

CREATE POLICY bank_transfers_tenant_select ON public.bank_transfers
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));
