-- Scrub legacy platform name from user-visible DB copy (WhatsApp/SMS templates, add-on catalog, SMS sender).
-- Historical migrations keep old literals; this updates live rows.

UPDATE public.whatsapp_templates
SET
  template_text = replace(
    replace(replace(template_text, 'במקור', 'Bino'), 'Bamakor', 'Bino'),
    'bamakor',
    'Bino'
  ),
  updated_at = now()
WHERE template_text ILIKE '%במקור%'
   OR template_text ILIKE '%bamakor%';

UPDATE public.paid_addons_catalog
SET
  description_he = replace(
    replace(replace(description_he, 'במקור', 'Bino'), 'Bamakor', 'Bino'),
    'bamakor',
    'Bino'
  )
WHERE description_he ILIKE '%במקור%'
   OR description_he ILIKE '%bamakor%';

-- Alphabetic SMS sender names fail on 019SMS; clear legacy brand defaults.
UPDATE public.clients
SET sms_sender_name = NULL
WHERE sms_sender_name ILIKE '%במקור%'
   OR sms_sender_name ILIKE '%bamakor%';

ALTER TABLE public.clients
  ALTER COLUMN sms_sender_name DROP DEFAULT;
