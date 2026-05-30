-- Personalize resident_prompt with {{reporter_name}} greeting prefix (pilot)

UPDATE whatsapp_templates
SET template_text = '{{reporter_name}}מה הבעיה? כתבו בקצרה את תיאור התקלה 📝'
WHERE template_key = 'resident_prompt'
  AND template_text = 'מה הבעיה? כתבו בקצרה את תיאור התקלה 📝';
