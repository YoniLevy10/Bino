-- Ops reference: Bamakor Disk IO Budget — api_rate_limits
-- Project: jsliqlmjksintyigkulq
--
-- Applied 2026-09-30 via migration `api_rate_limits_unlogged` (118):
--   ALTER TABLE public.api_rate_limits SET UNLOGGED;
--   ALTER TABLE public.rate_limits SET UNLOGGED;
-- SET UNLOGGED rewrites the heap (reclaimed ~17MB bloat) and stops WAL for
-- subsequent UPSERTs — the main Disk IO Budget consumer on Micro.
--
-- Ongoing cleanup (app): cron ticket-health every 6h calls
--   public.bamakor_rate_limit_cleanup_stale()
--
-- Manual re-check:
SELECT c.relname,
  CASE c.relpersistence WHEN 'u' THEN 'unlogged' ELSE 'logged' END AS persistence,
  pg_size_pretty(pg_relation_size(c.oid)) AS heap,
  (SELECT count(*) FROM public.api_rate_limits) AS api_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('api_rate_limits', 'rate_limits');

-- If bloat returns somehow (should not on UNLOGGED + cleanup):
-- SELECT public.bamakor_rate_limit_cleanup_stale();
-- VACUUM (ANALYZE) public.api_rate_limits;  -- run outside a transaction
