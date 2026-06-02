-- Premium = calendar + attendance only. pending_residents lives under Residents; billing unused for now.
-- Expand core package for tenants already restricted without premium unlocked.

UPDATE public.clients c
SET enabled_nav_features = '[
  "dashboard",
  "tickets",
  "projects",
  "residents",
  "workers",
  "summary",
  "qr",
  "whatsapp_templates",
  "billing",
  "pending_residents"
]'::jsonb
WHERE c.enabled_nav_features IS NOT NULL
  AND NOT (c.enabled_nav_features @> '["calendar"]'::jsonb)
  AND NOT (c.enabled_nav_features @> '["attendance"]'::jsonb);
