-- NFC sticker physical install tracking

ALTER TABLE public.worker_nfc_tags
  ADD COLUMN IF NOT EXISTS sticker_installed_at timestamptz;

COMMENT ON COLUMN public.worker_nfc_tags.sticker_installed_at IS 'When the physical NFC sticker was mounted on site';
