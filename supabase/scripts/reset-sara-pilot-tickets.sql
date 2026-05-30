-- One-shot pilot reset for Sara (מוקד תקלות Bamakor)
-- client_id from organizations.slug = 'bamakor-sarah'

SELECT public.bamakor_reset_client_tickets('7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid);
