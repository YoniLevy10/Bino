-- One-time: existing tenants had NULL (= unlimited). Apply core setup package only;
-- premium tabs require superadmin unlock after payment. Does not delete tenant data.

UPDATE public.clients c
SET enabled_nav_features = '[
  "dashboard",
  "tickets",
  "projects",
  "residents",
  "workers",
  "summary",
  "qr",
  "whatsapp_templates"
]'::jsonb
WHERE c.enabled_nav_features IS NULL
   OR EXISTS (
     SELECT 1
     FROM jsonb_array_elements_text(c.enabled_nav_features) AS t(id)
     WHERE t.id IN ('calendar', 'attendance', 'pending_residents', 'billing')
   );

COMMENT ON COLUMN public.clients.enabled_nav_features IS
  'JSON array of sidebar nav ids. NULL = unlimited (superadmin only, after payment). Non-null = allowlist. Default for new/existing tenants: core setup package; premium ids unlocked in superadmin.';
