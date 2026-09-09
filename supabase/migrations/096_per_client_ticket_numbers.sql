-- Per-tenant ticket numbers (not a global platform serial).
-- Existing rows keep their numbers; new tickets use MAX(ticket_number)+1 per client_id.
-- Also drop leftover global UNIQUE(project_code) — uniqueness is already (client_id, project_code).

-- 1) ticket_number: stop GENERATED ALWAYS AS IDENTITY (global sequence)
ALTER TABLE public.tickets
  ALTER COLUMN ticket_number DROP IDENTITY IF EXISTS;

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_ticket_number_key;

CREATE OR REPLACE FUNCTION public.assign_client_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow explicit numbers (imports / recovery); identity used to fill when omitted.
  IF NEW.ticket_number IS NOT NULL AND NEW.ticket_number > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required to assign ticket_number';
  END IF;

  -- Serialize next-number allocation per tenant within the transaction.
  PERFORM pg_advisory_xact_lock(87201401, hashtext('ticket_num:' || NEW.client_id::text));

  SELECT COALESCE(MAX(t.ticket_number), 0) + 1
    INTO NEW.ticket_number
  FROM public.tickets AS t
  WHERE t.client_id = NEW.client_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_client_ticket_number ON public.tickets;
CREATE TRIGGER trg_assign_client_ticket_number
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_client_ticket_number();

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_client_id_ticket_number_key UNIQUE (client_id, ticket_number);

COMMENT ON FUNCTION public.assign_client_ticket_number() IS
  'Assigns ticket_number as 1 + MAX per client_id (tenant-scoped), with advisory lock.';

-- 2) Reset RPC: no global sequence restart; per-client MAX handles next insert.
CREATE OR REPLACE FUNCTION public.bamakor_reset_client_tickets(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_ids UUID[];
  v_deleted_tickets INT := 0;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'client not found: %', p_client_id;
  END IF;

  SELECT array_agg(id)
  INTO v_ticket_ids
  FROM tickets
  WHERE client_id = p_client_id;

  IF v_ticket_ids IS NOT NULL THEN
    DELETE FROM ticket_internal_messages WHERE ticket_id = ANY (v_ticket_ids);
    DELETE FROM ticket_logs WHERE ticket_id = ANY (v_ticket_ids);
    DELETE FROM ticket_attachments WHERE ticket_id = ANY (v_ticket_ids);
  END IF;

  UPDATE pending_resident_join_requests
  SET ticket_id = NULL
  WHERE client_id = p_client_id;

  UPDATE sessions
  SET
    active_ticket_id = NULL,
    is_active = false,
    pending_whatsapp_media_id = NULL,
    pending_apartment_detail = NULL
  WHERE client_id = p_client_id;

  DELETE FROM tickets WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_deleted_tickets = ROW_COUNT;

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'deleted_tickets', v_deleted_tickets,
    'sequence_reset', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bamakor_reset_client_tickets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bamakor_reset_client_tickets(UUID) TO service_role;

COMMENT ON FUNCTION public.bamakor_reset_client_tickets(UUID) IS
  'Pilot/admin: hard-delete tenant tickets. Next ticket_number for that client starts at 1 again.';

-- 3) project_code already unique per client; remove obsolete global unique.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_project_code_key;
