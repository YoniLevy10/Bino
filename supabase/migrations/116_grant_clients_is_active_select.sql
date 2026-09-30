-- Hotfix: migration 078 omitted is_active from authenticated column GRANT.
-- Middleware .eq('is_active', true) then fails with:
--   permission denied for table clients
-- which produced CLIENTS_ACTIVE_QUERY_FAILED → login/nav 503.
GRANT SELECT (is_active) ON TABLE public.clients TO authenticated;
