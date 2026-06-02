-- Per-tenant sidebar menu order (array of stable nav item ids; null = app default).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sidebar_nav_order JSONB;

COMMENT ON COLUMN public.clients.sidebar_nav_order IS
  'Ordered JSON array of sidebar nav item ids (see lib/sidebar-nav.ts). NULL uses DEFAULT_SIDEBAR_NAV_ORDER.';
