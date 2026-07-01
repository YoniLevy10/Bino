-- Ensure distributed API rate limiter exists (migration 017 was never applied to production).
-- Used by lib/rate-limit.ts → checkAuthenticatedPostRouteLimit / checkRateLimit.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx ON public.api_rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.bamakor_rate_limit(
  p_key text,
  p_window_ms integer,
  p_max integer
)
RETURNS TABLE (is_limited boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := now();
  window_interval interval := make_interval(secs => p_window_ms / 1000.0);
  row_rec record;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 THEN
    RETURN QUERY SELECT true, 0, now_ts + window_interval;
    RETURN;
  END IF;

  LOOP
    UPDATE public.api_rate_limits
      SET count = count + 1
      WHERE key = p_key
        AND window_start + window_interval > now_ts
      RETURNING window_start, count INTO row_rec;

    IF FOUND THEN
      RETURN QUERY
        SELECT (row_rec.count > p_max) AS is_limited,
               GREATEST(p_max - row_rec.count, 0) AS remaining,
               row_rec.window_start + window_interval AS reset_at;
      RETURN;
    END IF;

    BEGIN
      INSERT INTO public.api_rate_limits(key, window_start, count)
        VALUES (p_key, now_ts, 1);

      RETURN QUERY SELECT false, GREATEST(p_max - 1, 0), now_ts + window_interval;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
END;
$$;

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_api_rate_limits ON public.api_rate_limits
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

REVOKE ALL ON FUNCTION public.bamakor_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bamakor_rate_limit(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.bamakor_rate_limit IS 'Atomic sliding-window rate limiter for Next.js API routes (service_role only).';
