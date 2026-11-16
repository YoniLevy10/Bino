-- Align project_documents display names to short sidebar label «מסמכים».
-- Code sources: SIDEBAR_NAV_REGISTRY + paid-addons-catalog; this clears DB overrides.

UPDATE public.paid_addons_catalog
SET name_he = 'מסמכים'
WHERE addon_key = 'project_documents'
  AND name_he IS DISTINCT FROM 'מסמכים';

-- Drop custom nav labels that still show the long legacy string (or near-variants).
UPDATE public.clients
SET sidebar_nav_labels = sidebar_nav_labels - 'project_documents'
WHERE sidebar_nav_labels ? 'project_documents'
  AND (
    sidebar_nav_labels->>'project_documents' IN (
      'תיקיית מסמכים לפרויקט',
      'תיקיית מסמכים',
      'מסמכי פרויקט',
      'מסמכי הבניין'
    )
  );
