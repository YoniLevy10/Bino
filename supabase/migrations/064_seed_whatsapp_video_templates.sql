-- Seed WhatsApp video template keys for all existing clients.
DO $$
DECLARE
  client_record RECORD;
BEGIN
  FOR client_record IN SELECT id FROM public.clients LOOP

    INSERT INTO public.whatsapp_templates (client_id, template_key, template_text)
    VALUES
      (client_record.id, 'video_attached',
       'הסרטון התקבל בהצלחה וצורף לתקלה. צוות הטכנאים יטפל בבקשתך בהקדם.'),

      (client_record.id, 'video_failed',
       'לא הצלחנו להוסיף את הסרטון, אך התקלה שלך נשמרה.' || chr(10) || chr(10) || 'נעדכן כשיהיה טיפול.'),

      (client_record.id, 'video_stashed',
       'קיבלנו את הסרטון!' || chr(10) || chr(10) || 'כדי לצרף אותו לתקלה, כתבו עכשיו בקצרה את תיאור התקלה בטקסט.')

    ON CONFLICT (client_id, template_key) DO NOTHING;

  END LOOP;
END $$;
