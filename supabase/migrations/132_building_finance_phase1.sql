-- BINO 2.0 Wave 3 — Building finance Phase 1 foundation (behind paid addon).
-- Separate from unit_ledger_entries (AR per unit). Do not mix building expenses into unit ledger.
-- Writes via service_role API only.

INSERT INTO public.paid_addons_catalog (addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order)
VALUES (
  'building_finance',
  'הנהלת חשבונות בניין',
  'הוצאות, תקציב ומרכז פיננסי לבניין — מאחורי תוסף; לא משנה את גביית Grow.',
  0,
  true,
  90
)
ON CONFLICT (addon_key) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.building_expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  key text NOT NULL,
  name_he text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT building_expense_categories_key_chk CHECK (key ~ '^[a-z0-9_]{2,40}$')
);

COMMENT ON TABLE public.building_expense_categories IS
  'Expense categories for building P&L (client-wide or per-project override).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_expense_categories_client_key
  ON public.building_expense_categories (client_id, key)
  WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_expense_categories_project_key
  ON public.building_expense_categories (client_id, project_id, key)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.building_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.building_expense_categories (id) ON DELETE SET NULL,
  vendor_name text,
  professional_id uuid REFERENCES public.professionals (id) ON DELETE SET NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ILS',
  expense_date date NOT NULL DEFAULT (timezone('Asia/Jerusalem', now()))::date,
  description text,
  receipt_url text,
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'void')),
  budget_period_key text,
  idempotency_key text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  void_reason text
);

COMMENT ON TABLE public.building_expenses IS
  'Building-level expenses (not unit AR). Append-only: void instead of delete approved rows.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_expenses_client_idempotency
  ON public.building_expenses (client_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_building_expenses_project_date
  ON public.building_expenses (client_id, project_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_building_expenses_category
  ON public.building_expenses (client_id, category_id)
  WHERE category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.building_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  period_key text NOT NULL,
  category_id uuid REFERENCES public.building_expense_categories (id) ON DELETE SET NULL,
  amount_planned numeric(12, 2) NOT NULL CHECK (amount_planned >= 0),
  currency text NOT NULL DEFAULT 'ILS',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT building_budgets_period_chk CHECK (period_key ~ '^[0-9]{4}(-Q[1-4]|-[0-9]{2})?$')
);

COMMENT ON TABLE public.building_budgets IS
  'Planned budget per building period (year / quarter / month) and optional category.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_budgets_project_period_cat
  ON public.building_budgets (client_id, project_id, period_key, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS idx_building_budgets_project_period
  ON public.building_budgets (client_id, project_id, period_key);

ALTER TABLE public.building_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_budgets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.building_expense_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.building_expenses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.building_budgets FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.building_expense_categories TO service_role;
GRANT ALL ON public.building_expenses TO service_role;
GRANT ALL ON public.building_budgets TO service_role;

-- Seed default system categories (client-wide templates; copied/used as shared keys).
-- Actual per-client rows are created on first enable via API; this is documentation only via COMMENT.
