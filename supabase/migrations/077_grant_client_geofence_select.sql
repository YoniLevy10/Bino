-- Grant geofence columns after 068_office_calendar_extras adds them (065 runs earlier).

GRANT SELECT (
  office_geofence_lat,
  office_geofence_lng,
  office_geofence_radius_m
) ON TABLE public.clients TO authenticated;
