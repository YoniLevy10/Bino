-- Audit #40: soft-delete projects instead of hard-delete + CASCADE wipe.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at
  ON public.projects (deleted_at)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.projects.deleted_at IS
  'Soft delete: when set, project is hidden; tickets/residents keep history.';
