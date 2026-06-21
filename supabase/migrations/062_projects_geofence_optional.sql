-- Optional geofence per project for NFC attendance (off by default until configured)

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS geofence_lat double precision,
  ADD COLUMN IF NOT EXISTS geofence_lng double precision,
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer;

COMMENT ON COLUMN public.projects.geofence_lat IS 'Optional center for NFC scan geofence validation';
