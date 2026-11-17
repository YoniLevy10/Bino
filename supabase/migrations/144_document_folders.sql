-- Independent document folders for מסמכים (project_documents archive).
-- Folders may be tied to a building (project_id) or client-wide (project_id NULL).
-- Writes via service_role API only; authenticated tenants may SELECT.

CREATE TABLE IF NOT EXISTS public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_folders_name_nonempty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.document_folders IS
  'Named folders for project_documents. project_id NULL = independent (client-wide) folder.';

CREATE INDEX IF NOT EXISTS idx_document_folders_client
  ON public.document_folders (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_folders_project
  ON public.document_folders (client_id, project_id)
  WHERE project_id IS NOT NULL;

-- Unique folder name per building; unique among independent folders per client.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_unique_project_name
  ON public.document_folders (client_id, project_id, lower(trim(name)))
  WHERE project_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_unique_independent_name
  ON public.document_folders (client_id, lower(trim(name)))
  WHERE project_id IS NULL;

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.document_folders (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_documents_folder
  ON public.project_documents (client_id, folder_id, created_at DESC)
  WHERE folder_id IS NOT NULL;

-- Allow files in independent folders (no building).
ALTER TABLE public.project_documents
  ALTER COLUMN project_id DROP NOT NULL;

-- Backfill one default folder per building that already has unfiled docs.
INSERT INTO public.document_folders (client_id, project_id, name)
SELECT d.client_id, d.project_id, 'מסמכים כלליים'
FROM (
  SELECT DISTINCT client_id, project_id
  FROM public.project_documents
  WHERE project_id IS NOT NULL
    AND folder_id IS NULL
) d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.document_folders f
  WHERE f.client_id = d.client_id
    AND f.project_id = d.project_id
    AND lower(trim(f.name)) = lower(trim('מסמכים כלליים'))
);

UPDATE public.project_documents pd
SET folder_id = f.id
FROM public.document_folders f
WHERE pd.folder_id IS NULL
  AND pd.project_id IS NOT NULL
  AND f.client_id = pd.client_id
  AND f.project_id = pd.project_id
  AND lower(trim(f.name)) = lower(trim('מסמכים כלליים'));

-- RLS: service_role full; authenticated tenant SELECT only.
ALTER TABLE public.document_folders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.document_folders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.document_folders TO service_role;
GRANT SELECT ON TABLE public.document_folders TO authenticated;

DROP POLICY IF EXISTS service_role_bypass_document_folders ON public.document_folders;
CREATE POLICY service_role_bypass_document_folders ON public.document_folders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_tenant_document_folders ON public.document_folders;
CREATE POLICY authenticated_tenant_document_folders ON public.document_folders
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));
