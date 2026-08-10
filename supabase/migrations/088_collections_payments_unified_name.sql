-- Unify collections product naming: גביית ועד + תשלומים → גבייה ותשלומים
-- Keeps addon_key = collections (no entitlement migration).

UPDATE public.paid_addons_catalog
SET
  name_he = 'גבייה ותשלומים',
  description_he = 'חיוב דיירים, קישורי תשלום ומעקב שולם/לא שולם דרך Morning — כולל חיבור סליקה',
  updated_at = now()
WHERE addon_key = 'collections';
