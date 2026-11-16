-- Building finance is a permanent/core product feature (not a paid addon).
-- Keep Grow `collections` as a separate paid addon.
-- Deactivate legacy catalog row so /addons and superadmin no longer sell it.
-- Safe to re-run. Does not drop tables from 132.

UPDATE public.paid_addons_catalog
SET
  is_active = false,
  name_he = 'הנהלת חשבונות בניין (ליבה)',
  description_he = 'פיצ׳ר ליבה — כספים ודוחות לכל דייר; לא תוסף בתשלום. גביית Grow נשארת תוסף נפרד.',
  updated_at = now()
WHERE addon_key = 'building_finance';
