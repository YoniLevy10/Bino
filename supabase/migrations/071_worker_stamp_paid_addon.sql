-- Paid add-on: worker stamp / attendance (QR + NFC)

INSERT INTO public.paid_addons_catalog (addon_key, name_he, description_he, price_ils_monthly, sort_order)
VALUES (
  'worker_stamp',
  'חתמת עובדים',
  'נוכחות עובדי שטח — סריקת QR/NFC, משמרות, דוחות וסנכרון Offline. תגי QR מונפקים על ידי במקור.',
  79,
  20
)
ON CONFLICT (addon_key) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  sort_order = EXCLUDED.sort_order;
