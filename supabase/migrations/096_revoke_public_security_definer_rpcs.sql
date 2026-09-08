-- Revoke PostgREST access to SECURITY DEFINER helpers that must be server/trigger-only.
REVOKE ALL ON FUNCTION public.billing_on_resident_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_on_ticket_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_on_worker_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bamakor_rate_limit_cleanup_stale() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bamakor_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bamakor_rate_limit_ip_endpoint(text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bamakor_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bamakor_rate_limit_ip_endpoint(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bamakor_rate_limit_cleanup_stale() TO service_role;
