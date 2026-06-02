-- Per-tenant feature flags for sidebar/routes (null = all nav features enabled).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS enabled_nav_features JSONB;

COMMENT ON COLUMN public.clients.enabled_nav_features IS
  'JSON array of sidebar nav item ids (lib/sidebar-nav.ts). NULL = all enabled. Superadmin only.';
