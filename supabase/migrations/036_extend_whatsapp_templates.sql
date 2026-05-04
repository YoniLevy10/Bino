-- Migration 036: Seed 19 new WhatsApp template keys for all existing clients.
-- Existing rows (welcome, ticket_opened, ticket_closed, worker_assigned, error_general) are left untouched.
-- Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe.

DO $$
DECLARE
  client_record RECORD;
BEGIN
  FOR client_record IN SELECT id FROM public.clients LOOP

    INSERT INTO public.whatsapp_templates (client_id, template_key, template_text)
    VALUES

      -- מיקום
      (client_record.id, 'location_attached',
       '📍 קיבלנו את המיקום וצירפנו אותו לתקלה.'),

      (client_record.id, 'location_stashed',
       '📍 קיבלנו את המיקום!' || chr(10) || 'כתבו עכשיו בקצרה את תיאור התקלה — נשלב את המיקום בפנייה.'),

      (client_record.id, 'location_error',
       'לא הצלחנו לקרוא את פרטי המיקום — נסו שוב או שלחו כתובת בטקסט.'),

      -- תמונה
      (client_record.id, 'image_attached',
       '✅ התמונה התקבלה בהצלחה וצורפה לתקלה. צוות הטכנאים יטפל בבקשתך בהקדם.'),

      (client_record.id, 'image_failed',
       '⚠️ לא הצלחנו להוסיף את התמונה, אך התקלה שלך תקבלה.' || chr(10) || chr(10) || 'נעדכן כשיהיה טיפול.'),

      (client_record.id, 'image_stashed',
       '🖼️ קיבלנו את התמונה!' || chr(10) || chr(10) || 'כדי לצרף אותה לתקלה, כתבו עכשיו בקצרה את תיאור התקלה בטקסט.'),

      -- סוגים לא נתמכים
      (client_record.id, 'redirect_to_text',
       'לדיווח תקלה שלחו הודעת טקסט 📝'),

      (client_record.id, 'unsupported_message',
       'לא הצלחנו לקרוא את ההודעה — נסו שוב בטקסט.'),

      -- QR / חיפוש בניין
      (client_record.id, 'qr_invalid',
       'פורמט קוד ה-QR לא תקין. אנא סרקו שוב את הקוד או פנו למנהלת הבניין.'),

      (client_record.id, 'project_not_found',
       '❌ לא הצלחנו לזהות את הפרויקט.' || chr(10) || chr(10) || 'נסו שוב:' || chr(10) || '1️⃣ סרקו את QR מחדש' || chr(10) || '2️⃣ או כתבו את כתובת הבניין (רחוב ומספר)' || chr(10) || '3️⃣ או צרו קשר למנהלת הבניין'),

      (client_record.id, 'building_not_found',
       'לא הצלחנו לזהות את הבניין.' || chr(10) || chr(10) || '📍 כדי שנוכל לאתר אותו, כתבו את כתובת הבניין (רחוב ומספר)' || chr(10) || chr(10) || 'או:' || chr(10) || '1. סרקו את קוד ה-QR בבניין' || chr(10) || '2. פנו למנהלת הבניין לקבלת קוד הגישה'),

      (client_record.id, 'building_multiple_matches',
       'מצאנו כמה בניינים תואמים:' || chr(10) || chr(10) || '{{list}}' || chr(10) || '📌 להמשך, השיבו רק עם מספר האפשרות: 1, 2 או 3'),

      (client_record.id, 'technical_error',
       'תקלה טכנית. אנא סרקו את קוד ה-QR בבניין או פנו למנהלת הבניין.'),

      (client_record.id, 'selection_invalid',
       'אנא השיבו רק עם מספר האפשרות המתאים: 1, 2 או 3.'),

      -- זרימת תקלה
      (client_record.id, 'session_created',
       'ברוכים הבאים! כתבו בקצרה את הבעיה ב{{project_name}}{{building_line}} 📝'),

      (client_record.id, 'resident_prompt',
       'מה הבעיה? כתבו בקצרה את תיאור התקלה 📝'),

      (client_record.id, 'duplicate_ticket',
       'קיבלנו כבר את הדיווח שלך, מספר תקלה: {{ticket_number}}. נעדכן אותך בהתקדמות.'),

      (client_record.id, 'no_open_tickets',
       'לא מצאנו תקלה פתוחה המקושרת למספר שלך במערכת. לפתיחת פנייה כתבו את הבניין או סרקו את קוד ה־QR.'),

      (client_record.id, 'pending_approval_note',
       chr(10) || chr(10) || 'ℹ️ מספר הטלפון שלכם עדיין לא מופיע ברשימת הדיירים של הבניין — הבקשה נשמרה לאישור המנהלת. אחרי האישור תופיעו ברשימה.')

    ON CONFLICT (client_id, template_key) DO NOTHING;

  END LOOP;
END $$;
