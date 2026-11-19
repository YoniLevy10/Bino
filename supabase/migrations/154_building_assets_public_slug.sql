-- Asset QR / public history — lightweight equipment memory (HVAC etc.)

ALTER TABLE public.building_assets
  ADD COLUMN IF NOT EXISTS public_slug TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS building_assets_public_slug_uidx
  ON public.building_assets (public_slug)
  WHERE public_slug IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.building_assets.public_slug IS
  'Public token for /asset/{slug} QR stickers — scan → history + open ticket';

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS asset_id UUID NULL
    REFERENCES public.building_assets (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_asset_id
  ON public.tickets (asset_id)
  WHERE asset_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.tickets.asset_id IS
  'Optional link to building_assets (e.g. HVAC unit from asset QR report)';
