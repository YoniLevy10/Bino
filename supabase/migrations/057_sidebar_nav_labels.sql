-- Custom Hebrew labels for sidebar nav items (partial map by nav id).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sidebar_nav_labels JSONB;

COMMENT ON COLUMN public.clients.sidebar_nav_labels IS
  'Optional map of sidebar nav item id → custom Hebrew label; overrides SIDEBAR_NAV_REGISTRY defaults.';
