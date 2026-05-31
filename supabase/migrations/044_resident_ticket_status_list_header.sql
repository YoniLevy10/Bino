-- ticket_status_list: bare {{list}} is hard for residents to read in WhatsApp.

UPDATE public.whatsapp_templates
SET
  template_text = 'התקלות הפתוחות שלך:' || chr(10) || chr(10) || '{{list}}',
  updated_at = now()
WHERE template_key = 'ticket_status_list'
  AND trim(template_text) = '{{list}}';
