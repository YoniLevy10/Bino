-- אימות אחרי ניקוי כפילויות (שאילתה אחת)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

SELECT COUNT(*) AS active_residents_after_cleanup
FROM residents
WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND deleted_at IS NULL
  AND full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם');
