-- Uncapped building expense period totals (KPIs / reports / budget alerts).
-- Row-capped list endpoints stay separate; never SUM from a LIMIT preview.

CREATE OR REPLACE FUNCTION public.building_expense_period_sum(
  p_client_id uuid,
  p_project_id uuid,
  p_mode text,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_period_key text DEFAULT NULL
)
RETURNS TABLE (
  spent numeric,
  expense_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE(SUM(e.amount), 0)::numeric AS spent,
    COUNT(*)::bigint AS expense_count
  FROM public.building_expenses e
  WHERE e.client_id = p_client_id
    AND e.project_id = p_project_id
    AND e.voided_at IS NULL
    AND (
      (
        p_mode = 'date_range'
        AND p_start_date IS NOT NULL
        AND p_end_date IS NOT NULL
        AND e.expense_date >= p_start_date
        AND e.expense_date <= p_end_date
      )
      OR (
        p_mode = 'period_key'
        AND p_period_key IS NOT NULL
        AND e.budget_period_key = p_period_key
      )
      OR (
        p_mode = 'year_or_period'
        AND p_start_date IS NOT NULL
        AND p_end_date IS NOT NULL
        AND p_period_key IS NOT NULL
        AND (
          (e.expense_date >= p_start_date AND e.expense_date <= p_end_date)
          OR e.budget_period_key = p_period_key
        )
      )
    );
$$;

COMMENT ON FUNCTION public.building_expense_period_sum(uuid, uuid, text, date, date, text) IS
  'SUM/COUNT building_expenses for a project period without row caps. Modes: date_range | period_key | year_or_period.';

-- building_expenses is service_role-only; keep the RPC the same.
REVOKE ALL ON FUNCTION public.building_expense_period_sum(uuid, uuid, text, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.building_expense_period_sum(uuid, uuid, text, date, date, text) TO service_role;
