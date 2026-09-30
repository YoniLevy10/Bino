-- Ops script: Bamakor Disk IO Budget — api_rate_limits remediation
-- Project: jsliqlmjksintyigkulq (Bamakor)
-- Run manually in Supabase SQL Editor (NOT via migration transaction).
--
-- Evidence (2026-09-30):
--   * 6.47M cumulative inserts on api_rate_limits, ~190 live rows, 17 MB heap bloat
--   * bamakor_rate_limit mean ~79ms; top app WAL writer
--   * cleanup RPC existed but was never scheduled (now hooked to cron.ticket-health)
--   * Checkpointer: ~110k writes / ~50k fsyncs → Disk IO Budget
--
-- A) Safe — delete stale windows (also runs every 6h via ticket-health cron)
SELECT public.bamakor_rate_limit_cleanup_stale();

-- B) Safe — reclaim dead space for reuse inside the file (does NOT shrink file size)
VACUUM (ANALYZE) public.api_rate_limits;

-- C) Optional, quiet window — exclusive lock; shrinks 17MB heap back to real size
-- VACUUM (FULL, ANALYZE) public.api_rate_limits;

-- D) Optional — eliminate WAL for ephemeral counters (table wiped on crash; OK for rate limits)
-- This is the largest ongoing Disk IO win after app sparse-sync lands.
-- ALTER TABLE public.api_rate_limits SET UNLOGGED;
-- COMMENT ON TABLE public.api_rate_limits IS
--   'Ephemeral sliding-window counters. UNLOGGED: crash resets limits (OK). Avoids WAL Disk IO.';

-- Verify
SELECT count(*) AS rows,
  pg_size_pretty(pg_relation_size('public.api_rate_limits')) AS heap,
  pg_size_pretty(pg_total_relation_size('public.api_rate_limits')) AS total
FROM public.api_rate_limits;
