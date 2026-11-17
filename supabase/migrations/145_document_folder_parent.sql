-- Nested document folders: optional parent_id self-ref + depth limit (0..2 = 3 levels).
-- Sibling name uniqueness replaces flat unique indexes from 144.
-- Writes remain service_role API only; authenticated SELECT unchanged.

ALTER TABLE public.document_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.document_folders (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS depth smallint NOT NULL DEFAULT 0;

ALTER TABLE public.document_folders
  DROP CONSTRAINT IF EXISTS document_folders_depth_range;

ALTER TABLE public.document_folders
  ADD CONSTRAINT document_folders_depth_range CHECK (depth >= 0 AND depth <= 2);

COMMENT ON COLUMN public.document_folders.parent_id IS
  'Parent folder; NULL = root under client / building. Max depth 2 (3 levels total).';

COMMENT ON COLUMN public.document_folders.depth IS
  '0 = root, 1 = child, 2 = grandchild. Enforced by CHECK + API.';

CREATE INDEX IF NOT EXISTS idx_document_folders_parent
  ON public.document_folders (client_id, parent_id, created_at DESC)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_folders_roots
  ON public.document_folders (client_id, project_id, created_at DESC)
  WHERE parent_id IS NULL;

-- Replace flat uniqueness with sibling uniqueness (same parent).
DROP INDEX IF EXISTS public.idx_document_folders_unique_project_name;
DROP INDEX IF EXISTS public.idx_document_folders_unique_independent_name;

-- COALESCE so multiple roots (parent_id NULL) still unique by name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_unique_project_sibling_name
  ON public.document_folders (
    client_id,
    project_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  )
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_unique_independent_sibling_name
  ON public.document_folders (
    client_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(name))
  )
  WHERE project_id IS NULL;

-- Parent must belong to same client; project_id must match parent (or both null).
CREATE OR REPLACE FUNCTION public.document_folders_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_row public.document_folders%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'document_folders parent_id cannot reference itself';
  END IF;

  SELECT * INTO parent_row
  FROM public.document_folders
  WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document_folders parent not found';
  END IF;

  IF parent_row.client_id IS DISTINCT FROM NEW.client_id THEN
    RAISE EXCEPTION 'document_folders parent must share client_id';
  END IF;

  IF parent_row.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'document_folders parent must share project_id';
  END IF;

  IF parent_row.depth >= 2 THEN
    RAISE EXCEPTION 'document_folders max depth is 2';
  END IF;

  NEW.depth := parent_row.depth + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_folders_parent_guard ON public.document_folders;
CREATE TRIGGER trg_document_folders_parent_guard
  BEFORE INSERT OR UPDATE OF parent_id, project_id, client_id
  ON public.document_folders
  FOR EACH ROW
  EXECUTE FUNCTION public.document_folders_parent_guard();
