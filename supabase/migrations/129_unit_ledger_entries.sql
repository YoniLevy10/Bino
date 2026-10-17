-- Unit ledger (כרטסת דירה): transaction history per unit for charges, payments, credits.
-- History stays on unit_id when resident changes (resident_id is a snapshot on the entry).
-- Writes via service_role API only (same pattern as collection_bulk_send_runs).

CREATE TABLE IF NOT EXISTS public.unit_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.project_units (id) ON DELETE SET NULL,
  resident_id uuid REFERENCES public.residents (id) ON DELETE SET NULL,
  entry_type text NOT NULL
    CHECK (entry_type IN ('charge', 'payment', 'credit', 'reversal')),
  -- Always positive; signed_amount carries direction (charge +, payment/credit/reversal -).
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  signed_amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  charge_id uuid REFERENCES public.collection_charges (id) ON DELETE SET NULL,
  period_label text,
  description text,
  payment_method text
    CHECK (
      payment_method IS NULL
      OR payment_method IN ('grow', 'cash', 'transfer', 'check', 'other', 'synced')
    ),
  receipt_note text,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_ledger_entries_signed_chk CHECK (
    (entry_type = 'charge' AND signed_amount = amount)
    OR (
      entry_type IN ('payment', 'credit', 'reversal')
      AND signed_amount = -amount
    )
  ),
  CONSTRAINT unit_ledger_entries_anchor_chk CHECK (
    unit_id IS NOT NULL OR resident_id IS NOT NULL
  )
);

COMMENT ON TABLE public.unit_ledger_entries IS
  'Per-unit financial ledger (כרטסת דירה). Prefer unit_id so history survives resident changes.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_ledger_client_idempotency
  ON public.unit_ledger_entries (client_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_unit_ledger_unit_created
  ON public.unit_ledger_entries (client_id, unit_id, created_at ASC)
  WHERE unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unit_ledger_resident_created
  ON public.unit_ledger_entries (client_id, resident_id, created_at ASC)
  WHERE resident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unit_ledger_charge
  ON public.unit_ledger_entries (charge_id)
  WHERE charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unit_ledger_project_created
  ON public.unit_ledger_entries (client_id, project_id, created_at DESC);

ALTER TABLE public.unit_ledger_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.unit_ledger_entries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.unit_ledger_entries TO service_role;
