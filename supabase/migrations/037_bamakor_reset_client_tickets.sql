-- Reset all tickets + related rows for one tenant; restart global ticket_number sequence.
-- Callable via RPC: SELECT bamakor_reset_client_tickets('client-uuid');

CREATE OR REPLACE FUNCTION public.bamakor_reset_client_tickets(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ticket_ids UUID[];
  v_deleted_tickets INT := 0;
  v_seq TEXT;
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

  v_seq := pg_get_serial_sequence('public.tickets', 'ticket_number');
  IF v_seq IS NOT NULL THEN
    -- Safe when no rows remain; next ticket will be #1.
    IF NOT EXISTS (SELECT 1 FROM tickets LIMIT 1) THEN
      PERFORM setval(v_seq, 1, false);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'deleted_tickets', v_deleted_tickets,
    'sequence_reset', v_seq IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets LIMIT 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bamakor_reset_client_tickets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bamakor_reset_client_tickets(UUID) TO service_role;

COMMENT ON FUNCTION public.bamakor_reset_client_tickets(UUID) IS
  'Pilot/admin: hard-delete tenant tickets and restart ticket_number when DB has no tickets left.';
