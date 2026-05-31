-- Fix 026 seed texts that never matched webhook flow (only when still the old literal).
-- Full bulk reset: only via SQL/migrations (no UI — avoids overwriting tenant edits).

UPDATE public.whatsapp_templates
SET template_text =
  'לדיווח תקלה: כתבו בטקסט את תיאור הבעיה, או סרקו את קוד ה־QR בבניין.' || chr(10) ||
  'אחרי שנפתחה פנייה – אפשר לשלוח גם תמונה של התקלה.',
  updated_at = now()
WHERE template_key = 'welcome'
  AND template_text =
    'שלום! ברוכים הבאים למערכת התקלות של {{project_name}}. כדי לפתוח תקלה חדשה, שלחו את תיאור הבעיה.';

UPDATE public.whatsapp_templates
SET template_text =
  'התקלה התקבלה בהצלחה.{{building_line}}' || chr(10) ||
  'מספר הפנייה שלך: {{ticket_number}}' || chr(10) || chr(10) ||
  'תיאור: {{description}}' || chr(10) ||
  'מדווח: {{reporter_name}}' || chr(10) ||
  'פרויקט: {{project_name}}' || chr(10) || chr(10) ||
  '💡 אפשר גם לשלוח תמונה של התקלה — זה יעזור לנו לטפל בה מהר יותר.' || chr(10) || chr(10) ||
  'נעדכן כשיהיה טיפול.' || chr(10) ||
  'לפתיחת תקלה נוספת: סרקו שוב את קוד ה־QR בבניין או כתבו רחוב ומספר בניין.',
  updated_at = now()
WHERE template_key = 'ticket_opened'
  AND template_text =
    'תקלה {{ticket_number}} נפתחה בהצלחה בפרויקט {{project_name}}. תיאור: {{description}}. נחזור אליכם בהקדם.';

UPDATE public.whatsapp_templates
SET template_text =
  '✅ שלום! התקלה שדיווחת בבניין {{project_name}} טופלה וסגורה.' || chr(10) || chr(10) ||
  'אם יש בעיה נוספת, ניתן לפנות אלינו בכל עת 🙏',
  updated_at = now()
WHERE template_key = 'ticket_closed'
  AND template_text =
    'תקלה {{ticket_number}} נסגרה. תודה שפניתם! במקור — ניהול תקלות חכם.';

UPDATE public.whatsapp_templates
SET template_text =
  'תקלה חדשה ב{{project_name}}' || chr(10) ||
  'מספר: #{{ticket_number}}' || chr(10) ||
  '{{description}}' || chr(10) ||
  'מדווח: {{reporter_name}}',
  updated_at = now()
WHERE template_key = 'worker_assigned'
  AND template_text =
    'תקלה {{ticket_number}} הוקצתה לטיפול. אנו על זה — נעדכן אתכם בקרוב.';

UPDATE public.whatsapp_templates
SET template_text = '⚠️ אירעה שגיאה. אנא נסו שוב או פנו למנהלת הבניין.',
  updated_at = now()
WHERE template_key = 'error_general'
  AND template_text = 'אירעה שגיאה במערכת. אנא נסו שוב או פנו למנהל.';
