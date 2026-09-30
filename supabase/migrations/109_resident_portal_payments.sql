-- Resident portal payment fields on collection_charges.

ALTER TABLE public.collection_charges
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS published_to_portal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_collection_charges_portal_resident
  ON public.collection_charges (resident_id, published_to_portal, status)
  WHERE published_to_portal = true;

COMMENT ON COLUMN public.collection_charges.published_to_portal IS
  'Explicit publish flag — drafts never appear in resident portal.';
COMMENT ON COLUMN public.collection_charges.due_date IS
  'Due date for overdue display in portal; overdue is derived, not stored.';

-- Auto-publish when charge is sent (manager can still unpublish).
CREATE OR REPLACE FUNCTION public.collection_charges_auto_publish_on_sent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
    NEW.published_to_portal := true;
  END IF;
  IF NEW.status IN ('draft', 'cancelled') THEN
    NEW.published_to_portal := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_charges_auto_publish ON public.collection_charges;
CREATE TRIGGER trg_collection_charges_auto_publish
  BEFORE UPDATE OF status ON public.collection_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.collection_charges_auto_publish_on_sent();
