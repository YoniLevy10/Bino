-- Seed last_project_confirm template for returning residents (same / other building buttons).

DO $$
DECLARE
  client_record RECORD;
BEGIN
  FOR client_record IN SELECT id FROM public.clients LOOP
    INSERT INTO public.whatsapp_templates (client_id, template_key, template_text)
    VALUES (
      client_record.id,
      'last_project_confirm',
      'לדווח שוב על {{project_name}}?' || chr(10) || chr(10) ||
      'Signaler à nouveau pour {{project_name}} ?' || chr(10) || chr(10) ||
      'Report again for {{project_name}}?'
    )
    ON CONFLICT (client_id, template_key) DO NOTHING;
  END LOOP;
END $$;
