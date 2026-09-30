-- Disk IO Budget: stop WAL for ephemeral API rate-limit counters.
--
-- Why: Bamakor Micro Disk IO Budget was dominated by UPSERTs into
-- public.api_rate_limits (millions of historical inserts, 17MB heap bloat,
-- checkpointer fsyncs). Counters are sliding-window only — losing them on
-- crash/restart is acceptable (limits reset briefly).
--
-- SET UNLOGGED rewrites the heap (also reclaiming bloat) and subsequent
-- UPSERTs no longer generate WAL.

SELECT public.bamakor_rate_limit_cleanup_stale();

ALTER TABLE public.api_rate_limits SET UNLOGGED;

COMMENT ON TABLE public.api_rate_limits IS
  'Ephemeral sliding-window API rate counters (service_role RPC). UNLOGGED: no WAL — crash/restart truncates the table and resets limits (acceptable). Keeps Disk IO Budget sustainable on Micro.';

-- Same rationale for the smaller IP+endpoint limiter table.
ALTER TABLE public.rate_limits SET UNLOGGED;

COMMENT ON TABLE public.rate_limits IS
  'Ephemeral IP+endpoint sliding window (bamakor_rate_limit_ip_endpoint). UNLOGGED: crash resets counters (OK). Avoids WAL Disk IO.';
