-- Document nav feature modes. No data changes — existing clients keep NULL (unlimited).

COMMENT ON COLUMN public.clients.enabled_nav_features IS
  'JSON array of sidebar nav ids (lib/sidebar-nav.ts). NULL = legacy unlimited for existing tenants (unchanged). Non-null = allowlist. New clients via /api/admin/setup-client get SETUP_PACKAGE_NAV_FEATURE_IDS; unlock premium tabs in superadmin after payment.';
