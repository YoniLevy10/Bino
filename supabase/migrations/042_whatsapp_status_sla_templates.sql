-- Seed new editable WhatsApp templates: status list reply + SLA resident escalation.
DO $$
DECLARE
  client_record RECORD;
BEGIN
  FOR client_record IN SELECT id FROM public.clients LOOP
    INSERT INTO public.whatsapp_templates (client_id, template_key, template_text)
    VALUES
      (client_record.id, 'ticket_status_list', '{{list}}'),
      (client_record.id, 'sla_escalation_resident',
       'שלום, הפנייה שלך #{{ticket_number}} בנושא "{{description}}" עדיין בטיפול.' || chr(10) ||
       'אנחנו מטפלים בה. תודה על הסבלנות.')
    ON CONFLICT (client_id, template_key) DO NOTHING;
  END LOOP;
END $$;
