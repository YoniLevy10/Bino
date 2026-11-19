-- Calendar is a permanent/core product feature (ops hub with tasks).
-- Deactivate legacy catalog row so /addons and superadmin no longer sell it.
-- Safe to re-run. App also treats calendar as RETIRED_PAID_ADDON_KEYS.

UPDATE public.paid_addons_catalog
SET
  is_active = false,
  name_he = 'יומן (ליבה)',
  description_he = 'פיצ׳ר ליבה — יומן משרד + משימות תחזוקה לכל לקוח; לא תוסף בתשלום.',
  updated_at = now()
WHERE addon_key = 'calendar';
