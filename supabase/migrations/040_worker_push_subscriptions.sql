-- Web Push subscriptions for field workers (token portal, no Supabase auth user).

CREATE TABLE IF NOT EXISTS public.worker_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_push_subscriptions_worker_client
  ON public.worker_push_subscriptions (worker_id, client_id);

CREATE INDEX IF NOT EXISTS idx_worker_push_subscriptions_client
  ON public.worker_push_subscriptions (client_id);

ALTER TABLE public.worker_push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "service_role_bypass" ON public.worker_push_subscriptions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.worker_push_subscriptions IS
  'Web Push subscription JSON per worker+client; server sends via web-push on assign.';
