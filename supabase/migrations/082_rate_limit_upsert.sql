-- Fix bamakor_rate_limit: replace retry LOOP with single UPSERT (avoids statement timeout under burst traffic).

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
  now_ts timestamptz := clock_timestamp();
  window_interval interval := make_interval(secs => GREATEST(p_window_ms, 1) / 1000.0);
  ws timestamptz;
  cnt integer;
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 THEN
    RETURN QUERY SELECT true, 0, now_ts + window_interval;
    RETURN;
  END IF;

  INSERT INTO public.api_rate_limits AS r (key, window_start, count)
  VALUES (p_key, now_ts, 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN r.window_start + window_interval > now_ts THEN r.count + 1
      ELSE 1
    END,
    window_start = CASE
      WHEN r.window_start + window_interval > now_ts THEN r.window_start
      ELSE now_ts
    END
  RETURNING r.window_start, r.count INTO ws, cnt;

  RETURN QUERY SELECT
    (cnt > p_max) AS is_limited,
    GREATEST(p_max - cnt, 0) AS remaining,
    ws + window_interval AS reset_at;
END;
$$;

-- Keep table small — stale windows are never read again.
CREATE OR REPLACE FUNCTION public.bamakor_rate_limit_cleanup_stale()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.api_rate_limits
  WHERE window_start < now() - interval '6 hours';
$$;

REVOKE ALL ON FUNCTION public.bamakor_rate_limit_cleanup_stale() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bamakor_rate_limit_cleanup_stale() TO service_role;

COMMENT ON FUNCTION public.bamakor_rate_limit IS 'Atomic sliding-window rate limiter (UPSERT, no retry loop).';
